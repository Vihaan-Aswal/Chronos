"""
Chronos Exhaustive Table-Driven State Machine Transition & Invariant Tests
Domain Subsystem: Observation & State Machine

Exhaustively verifies:
1. Full Cartesian matrix: Initial State x Initial Case State x Input Window -> Next State.
2. All 10 domain invariants explicitly.
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
import itertools
import pytest

from observation.config import ObservationClockConfig, get_config
from observation.classifier import UsableSegmentClassifier, SegmentClassificationResult
from observation.window_evaluator import WindowEvaluator
from observation.state_machine import ObservationStateMachine
from tests.fixtures.synthetic_factories import (
    make_synthetic_window,
    make_synthetic_observation_segment,
)


# ==============================================================================
# Helper transition oracle for expected deterministic behavior
# ==============================================================================

def compute_expected_transition(
    initial_attention: str,
    initial_case: str,
    initial_warning_streak: int,
    initial_clean_streak: int,
    input_type: str,
) -> Dict[str, Any]:
    """Pure specification oracle for single-window state transitions."""
    if input_type in ("NO_DATA", "NOT_EVALUATED"):
        return {
            "observation_state": "NO_DATA",
            "classification": "NOT_EVALUATED",
            "attention_pattern": initial_attention,
            "case_state": initial_case,
            "warning_streak": initial_warning_streak,
            "clean_streak": initial_clean_streak,
            "escalated": False,
            "recovered": False,
        }

    elif input_type in ("VALID_WARNING", "WARNING"):
        new_warn = initial_warning_streak + 1
        new_clean = 0
        if new_warn == 1:
            att = "VARIABLE"
            case = "SELF_RECOVERY"
        elif new_warn == 2:
            att = "VARIABLE"
            case = "MONITOR"
        else:  # >= 3
            att = "SUSTAINED_CONCERN"
            case = "ACTION_REQUIRED"

        return {
            "observation_state": "VALID",
            "classification": "VALID_WARNING",
            "attention_pattern": att,
            "case_state": case,
            "warning_streak": new_warn,
            "clean_streak": new_clean,
            "escalated": True,
            "recovered": False,
        }

    elif input_type in ("VALID_CLEAN", "CLEAN"):
        new_clean = initial_clean_streak + 1
        if new_clean == 1:
            att = "VARIABLE" if initial_attention == "SUSTAINED_CONCERN" else initial_attention
            case = initial_case
            warn = initial_warning_streak
            rec = False
        else:  # >= 2
            att = "STABLE"
            case = "RESOLVED" if initial_case != "NONE" else "NONE"
            warn = 0
            rec = True

        return {
            "observation_state": "VALID",
            "classification": "VALID_CLEAN",
            "attention_pattern": att,
            "case_state": case,
            "warning_streak": warn,
            "clean_streak": new_clean,
            "escalated": False,
            "recovered": rec,
        }
    else:
        raise ValueError(f"Unknown input_type: {input_type}")


# ==============================================================================
# Matrix Generation
# ==============================================================================

ATTENTION_STATES = ["STABLE", "VARIABLE", "SUSTAINED_CONCERN", "UNKNOWN"]
CASE_STATES = ["NONE", "SELF_RECOVERY", "MONITOR", "ACTION_REQUIRED", "RESOLVED"]
INPUT_WINDOWS = ["VALID_CLEAN", "VALID_WARNING", "NO_DATA"]

# Generate all 4 x 5 x 3 = 60 baseline matrix entries
TRANSITION_MATRIX: List[Tuple[str, str, str]] = list(
    itertools.product(ATTENTION_STATES, CASE_STATES, INPUT_WINDOWS)
)


@pytest.mark.unit
class TestTableDrivenTransitions:
    """
    Exhaustively tests the entire state transition matrix for ObservationStateMachine.
    """

    @pytest.mark.parametrize("init_att,init_case,input_win", TRANSITION_MATRIX)
    def test_full_cartesian_transition_matrix(
        self,
        init_att: str,
        init_case: str,
        input_win: str,
    ):
        """
        Parametrized test for every combination of (Initial Attention, Initial Case, Input Window).
        """
        # Pick standard default streaks corresponding to initial state
        init_warn = 0
        init_clean = 0
        if init_case == "SELF_RECOVERY":
            init_warn = 1
        elif init_case == "MONITOR":
            init_warn = 2
        elif init_case == "ACTION_REQUIRED":
            init_warn = 3
        elif init_case == "RESOLVED":
            init_clean = 2

        sm = ObservationStateMachine(
            initial_attention_pattern=init_att,
            initial_case_state=init_case,
            initial_warning_streak=init_warn,
            initial_clean_streak=init_clean,
        )

        window_payload = {
            "observation_state": "NO_DATA" if input_win == "NO_DATA" else "VALID",
            "classification": "NOT_EVALUATED" if input_win == "NO_DATA" else input_win,
        }

        expected = compute_expected_transition(
            initial_attention=init_att,
            initial_case=init_case,
            initial_warning_streak=init_warn,
            initial_clean_streak=init_clean,
            input_type=input_win,
        )

        res = sm.evaluate_window(window_payload)

        # Assert exact transition match
        assert res["observation_state"] == expected["observation_state"]
        assert res["classification"] == expected["classification"]
        assert res["attention_pattern"] == expected["attention_pattern"]
        assert res["attention_state"] == expected["attention_pattern"]
        assert res["case_state"] == expected["case_state"]
        assert res["warning_streak"] == expected["warning_streak"]
        assert res["clean_streak"] == expected["clean_streak"]
        assert res["escalated"] == expected["escalated"]
        assert res["recovered"] == expected["recovered"]

        # Assert internal state machine state matches
        assert sm.attention_pattern == expected["attention_pattern"]
        assert sm.attention_state == expected["attention_pattern"]
        assert sm.case_state == expected["case_state"]
        assert sm.warning_streak == expected["warning_streak"]
        assert sm.clean_streak == expected["clean_streak"]

    @pytest.mark.parametrize("initial_warning_streak", [0, 1, 2, 3, 5])
    @pytest.mark.parametrize("initial_clean_streak", [0, 1, 2, 4])
    @pytest.mark.parametrize("input_win", ["VALID_CLEAN", "VALID_WARNING", "NO_DATA"])
    def test_streak_parameterized_transitions(
        self,
        initial_warning_streak: int,
        initial_clean_streak: int,
        input_win: str,
    ):
        """
        Parametrized matrix over various warning and clean streak counts.
        """
        init_att = "SUSTAINED_CONCERN" if initial_warning_streak >= 3 else ("VARIABLE" if initial_warning_streak > 0 else "STABLE")
        init_case = "ACTION_REQUIRED" if initial_warning_streak >= 3 else ("MONITOR" if initial_warning_streak == 2 else ("SELF_RECOVERY" if initial_warning_streak == 1 else "NONE"))

        sm = ObservationStateMachine(
            initial_attention_pattern=init_att,
            initial_case_state=init_case,
            initial_warning_streak=initial_warning_streak,
            initial_clean_streak=initial_clean_streak,
        )

        window_payload = {
            "observation_state": "NO_DATA" if input_win == "NO_DATA" else "VALID",
            "classification": "NOT_EVALUATED" if input_win == "NO_DATA" else input_win,
        }

        expected = compute_expected_transition(
            initial_attention=init_att,
            initial_case=init_case,
            initial_warning_streak=initial_warning_streak,
            initial_clean_streak=initial_clean_streak,
            input_type=input_win,
        )

        res = sm.evaluate_window(window_payload)

        assert res["attention_pattern"] == expected["attention_pattern"]
        assert res["case_state"] == expected["case_state"]
        assert res["warning_streak"] == expected["warning_streak"]
        assert res["clean_streak"] == expected["clean_streak"]
        assert res["escalated"] == expected["escalated"]
        assert res["recovered"] == expected["recovered"]


# ==============================================================================
# Explicit Domain Invariants (1 through 10)
# ==============================================================================

@pytest.mark.unit
class TestDomainInvariants:
    """
    Explicit verification of all 10 Chronos Domain Invariants.
    """

    def test_invariant_1_no_data_never_becomes_warning(self):
        """
        Invariant 1: NO_DATA never becomes warning.
        Unusable segments (e.g. camera off, no face) even with extreme head tilt
        must evaluate to NO_DATA / NOT_EVALUATED, never VALID_WARNING.
        State machine must never classify NO_DATA as warning or escalate.
        """
        # Evaluator level:
        # All 12 segments have camera_active=False and orientation_away=True
        unusable_segments = [
            {"camera_active": False, "yaw_deg": 45.0, "orientation_away": True}
            for _ in range(12)
        ]
        win_res = WindowEvaluator.evaluate_segments(unusable_segments)
        assert win_res["observation_state"] == "NO_DATA"
        assert win_res["classification"] == "NOT_EVALUATED"
        assert win_res["cue_exposure_seconds"] == 0.0

        # State machine level:
        sm = ObservationStateMachine(initial_warning_streak=0)
        res = sm.evaluate_window(win_res)
        assert res["observation_state"] == "NO_DATA"
        assert res["classification"] == "NOT_EVALUATED"
        assert res["warning_streak"] == 0
        assert res["escalated"] is False

    def test_invariant_2_no_data_never_becomes_clean(self):
        """
        Invariant 2: NO_DATA never becomes clean.
        Unusable segments must never produce a VALID_CLEAN window,
        and passing NO_DATA to state machine never increments clean streak.
        """
        # Evaluator level:
        # 12 segments with face_count=0 (no face)
        segments = [{"face_count": 0, "yaw_deg": 0.0} for _ in range(12)]
        win_res = WindowEvaluator.evaluate_segments(segments)
        assert win_res["observation_state"] == "NO_DATA"
        assert win_res["classification"] == "NOT_EVALUATED"

        # State machine level:
        sm = ObservationStateMachine(initial_clean_streak=0)
        res = sm.evaluate_window(win_res)
        assert res["clean_streak"] == 0
        assert res["recovered"] is False

    def test_invariant_3_no_data_never_counts_as_recovery(self):
        """
        Invariant 3: NO_DATA never counts as recovery.
        When in ACTION_REQUIRED / SUSTAINED_CONCERN, receiving NO_DATA windows
        must freeze state; clean streak must stay 0, recovered must stay False,
        and case state must NOT transition to RESOLVED.
        """
        sm = ObservationStateMachine(
            initial_attention_pattern="SUSTAINED_CONCERN",
            initial_case_state="ACTION_REQUIRED",
            initial_warning_streak=3,
            initial_clean_streak=0,
        )

        for _ in range(5):
            res = sm.evaluate_window({
                "observation_state": "NO_DATA",
                "classification": "NOT_EVALUATED",
            })
            assert res["attention_pattern"] == "SUSTAINED_CONCERN"
            assert res["case_state"] == "ACTION_REQUIRED"
            assert res["clean_streak"] == 0
            assert res["warning_streak"] == 3
            assert res["recovered"] is False
            assert res["escalated"] is False

    def test_invariant_4_technical_intervals_never_become_attention_cues(self):
        """
        Invariant 4: Technical intervals never become attention cues.
        Segments with camera inactive, face count != 1, low quality (<0.7),
        or low confidence (<0.6) must have cue_away=False in classifier
        and contribute 0.0 seconds of cue exposure in window evaluator.
        """
        technical_payloads = [
            {"camera_active": False, "yaw_deg": 40.0, "orientation_away": True},
            {"face_count": 0, "yaw_deg": 35.0},
            {"face_count": 2, "yaw_deg": 30.0},
            {"quality_score": 0.50, "yaw_deg": 45.0},
            {"pose_confidence": 0.40, "yaw_deg": 45.0},
            {"usable": False, "yaw_deg": 50.0},
        ]

        for payload in technical_payloads:
            res = UsableSegmentClassifier.classify(payload)
            assert res.usable is False, f"Expected unusable for payload: {payload}"
            assert res.cue_away is False, f"Expected cue_away=False for payload: {payload}"
            assert len(res.technical_reasons) > 0

        # Feed 12 unusable segments into window evaluator
        win_res = WindowEvaluator.evaluate_segments(technical_payloads * 2)
        assert win_res["cue_exposure_seconds"] == 0.0
        assert win_res["reason_codes"] == []

    def test_invariant_5_page_hidden_never_enters_attention_exposure(self):
        """
        Invariant 5: PAGE_HIDDEN never enters attention exposure.
        Segments marked with browser_context="PAGE_HIDDEN" or is_page_hidden=True
        must have cue_away=False and attention_reasons=[], even if head is turned.
        Window evaluator must calculate 0.0 cue exposure for them.
        """
        hidden_payload = {
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
            "pose_confidence": 0.95,
            "browser_context": "PAGE_HIDDEN",
            "yaw_deg": 45.0,
            "pitch_deg": 30.0,
            "orientation_away": True,
        }

        clf = UsableSegmentClassifier.classify(hidden_payload)
        assert clf.usable is True
        assert clf.cue_away is False
        assert clf.attention_reasons == []

        # 12 usable segments all with PAGE_HIDDEN
        segments = [hidden_payload for _ in range(12)]
        win_res = WindowEvaluator.evaluate_segments(segments)
        assert win_res["observation_state"] == "VALID"
        assert win_res["classification"] == "VALID_CLEAN"
        assert win_res["cue_exposure_seconds"] == 0.0
        assert win_res["reason_codes"] == []

    def test_invariant_6_identity_never_changes_attention_state(self):
        """
        Invariant 6: Identity never changes attention state.
        External identity results (MISMATCH, QUALITY_FAIL, LOW_CONFIDENCE, MATCH)
        or active presence challenge status do not mutate observation state machine.
        """
        sm = ObservationStateMachine(
            initial_attention_pattern="STABLE",
            initial_case_state="NONE",
            initial_warning_streak=0,
            initial_clean_streak=1,
        )

        # In Chronos, identity events are distinct domain streams.
        # Observation state machine only processes observation windows.
        # A clean observation window keeps attention STABLE.
        res = sm.evaluate_window({
            "observation_state": "VALID",
            "classification": "VALID_CLEAN",
            "identity_state": "MISMATCH",  # External field
            "embedding_distance": 0.85,    # External field
        })
        assert res["attention_pattern"] == "STABLE"
        assert res["case_state"] == "NONE"
        assert res["clean_streak"] == 2

    def test_invariant_7_single_sample_never_creates_persistent_concern(self):
        """
        Invariant 7: A single sample never creates persistent concern.
        A single 5s (real) or 1s (demo) sample with cue_away cannot trigger a warning window
        (since warning requires >=20s / >=4s).
        Even a full warning window only creates VARIABLE / SELF_RECOVERY, never SUSTAINED_CONCERN.
        """
        cfg_real = get_config(is_demo=False)
        # 1 sample of cue_away (5s) + 11 forward-facing samples
        segments = [{"yaw_deg": 35.0, "quality_score": 0.95}] + [
            {"yaw_deg": 0.0, "quality_score": 0.95} for _ in range(11)
        ]
        win_res = WindowEvaluator.evaluate_segments(segments, config=cfg_real)
        assert win_res["classification"] == "VALID_CLEAN"
        assert win_res["cue_exposure_seconds"] == 5.0

        # State machine on single warning window
        sm = ObservationStateMachine(is_demo=False)
        sm_res = sm.evaluate_window({
            "observation_state": "VALID",
            "classification": "VALID_WARNING",
        })
        assert sm_res["attention_pattern"] == "VARIABLE"
        assert sm_res["case_state"] == "SELF_RECOVERY"
        assert sm_res["attention_pattern"] != "SUSTAINED_CONCERN"
        assert sm_res["case_state"] != "ACTION_REQUIRED"

    def test_invariant_8_three_valid_warning_windows_required_for_persistent_concern(self):
        """
        Invariant 8: Three valid warning windows required for persistent concern.
        1st warning -> VARIABLE / SELF_RECOVERY (warning_streak = 1)
        2nd warning -> VARIABLE / MONITOR (warning_streak = 2)
        3rd warning -> SUSTAINED_CONCERN / ACTION_REQUIRED (warning_streak = 3)
        """
        sm = ObservationStateMachine(is_demo=False)
        w = {"observation_state": "VALID", "classification": "VALID_WARNING"}

        # Window 1
        r1 = sm.evaluate_window(w)
        assert r1["warning_streak"] == 1
        assert r1["clean_streak"] == 0
        assert r1["attention_pattern"] == "VARIABLE"
        assert r1["case_state"] == "SELF_RECOVERY"
        assert r1["escalated"] is True
        assert r1["recovered"] is False

        # Window 2
        r2 = sm.evaluate_window(w)
        assert r2["warning_streak"] == 2
        assert r2["clean_streak"] == 0
        assert r2["attention_pattern"] == "VARIABLE"
        assert r2["case_state"] == "MONITOR"
        assert r2["escalated"] is True
        assert r2["recovered"] is False

        # Window 3
        r3 = sm.evaluate_window(w)
        assert r3["warning_streak"] == 3
        assert r3["clean_streak"] == 0
        assert r3["attention_pattern"] == "SUSTAINED_CONCERN"
        assert r3["case_state"] == "ACTION_REQUIRED"
        assert r3["escalated"] is True
        assert r3["recovered"] is False

    def test_invariant_9_two_valid_clean_windows_required_for_recovery(self):
        """
        Invariant 9: Two valid clean windows required for recovery.
        From SUSTAINED_CONCERN / ACTION_REQUIRED:
        Clean window 1: Partial recovery -> VARIABLE / ACTION_REQUIRED (clean_streak = 1, recovered = False)
        Clean window 2: Stable recovery -> STABLE / RESOLVED (clean_streak = 2, warning_streak = 0, recovered = True)
        """
        sm = ObservationStateMachine(
            initial_attention_pattern="SUSTAINED_CONCERN",
            initial_case_state="ACTION_REQUIRED",
            initial_warning_streak=3,
            initial_clean_streak=0,
        )
        w_clean = {"observation_state": "VALID", "classification": "VALID_CLEAN"}

        # 1st clean window
        r1 = sm.evaluate_window(w_clean)
        assert r1["clean_streak"] == 1
        assert r1["warning_streak"] == 3  # Warning streak not cleared yet
        assert r1["attention_pattern"] == "VARIABLE"
        assert r1["case_state"] == "ACTION_REQUIRED"
        assert r1["escalated"] is False
        assert r1["recovered"] is False

        # 2nd clean window
        r2 = sm.evaluate_window(w_clean)
        assert r2["clean_streak"] == 2
        assert r2["warning_streak"] == 0  # Cleared
        assert r2["attention_pattern"] == "STABLE"
        assert r2["case_state"] == "RESOLVED"
        assert r2["escalated"] is False
        assert r2["recovered"] is True

    def test_invariant_10_stale_evidence_timeout_expires_warning_streak(self):
        """
        Invariant 10: 300s of continuous NO_DATA in real session expires warning streak.
        Configured timeout (300s real, 60s demo).
        When warning streak > 0 enters NO_DATA, streak is maintained if elapsed < 300s,
        and reset to 0 once elapsed >= 300s.
        """
        start = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)
        sm = ObservationStateMachine(is_demo=False)  # timeout = 300s

        # 2 warning windows (at t=0s and t=60s)
        sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"}, timestamp=start)
        sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"}, timestamp=start + timedelta(seconds=60))
        assert sm.warning_streak == 2

        # NO_DATA starts at t=120s
        t_no_data = start + timedelta(seconds=120)
        r_nd1 = sm.evaluate_window(
            {"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"},
            timestamp=t_no_data
        )
        assert r_nd1["warning_streak"] == 2

        # At t=120 + 290s = t=410s (< 300s since NO_DATA start)
        r_nd2 = sm.evaluate_window(
            {"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"},
            timestamp=t_no_data + timedelta(seconds=290)
        )
        assert r_nd2["warning_streak"] == 2
        assert sm.warning_streak == 2

        # At t=120 + 300s = t=420s (>= 300s stale timeout)
        r_nd3 = sm.evaluate_window(
            {"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"},
            timestamp=t_no_data + timedelta(seconds=300)
        )
        assert r_nd3["warning_streak"] == 0
        assert sm.warning_streak == 0
        assert r_nd3["stale_expired"] is True
