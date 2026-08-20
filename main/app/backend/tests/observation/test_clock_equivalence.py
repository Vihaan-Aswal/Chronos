"""
Chronos Real Clock and Demo Clock Equivalence Tests
Domain Subsystem: Observation & State Machine

Proves that real session clock and demo session clock implementations
are mathematically and logically equivalent, with identical state transitions,
invariants, recovery progression, and case lifecycle.
"""
from typing import Any, Dict, List
import pytest

from observation.config import ObservationClockConfig, get_config
from observation.window_evaluator import WindowEvaluator
from observation.state_machine import ObservationStateMachine


def make_normalized_scenario_segments(
    is_demo: bool,
    scenario_type: str,  # "CLEAN", "WARNING", "UNUSABLE"
) -> List[Dict[str, Any]]:
    """Generates segment fixtures for one window according to clock parameters."""
    cfg = get_config(is_demo=is_demo)
    segments: List[Dict[str, Any]] = []

    if scenario_type == "CLEAN":
        for _ in range(cfg.expected_segments):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": False,
            })
    elif scenario_type == "WARNING":
        # Exactly enough cue exposure for warning
        cue_samples = int(cfg.warning_cue_exposure_sec / cfg.sample_interval_sec)
        clean_samples = cfg.expected_segments - cue_samples
        for _ in range(cue_samples):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": True,
            })
        for _ in range(clean_samples):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": False,
            })
    elif scenario_type == "UNUSABLE":
        # All camera off
        for _ in range(cfg.expected_segments):
            segments.append({
                "camera_active": False,
                "technical_reasons": ["CAMERA_UNAVAILABLE"],
            })

    return segments


@pytest.mark.unit
class TestRealAndDemoClockEquivalence:
    """Mathematical equivalence testing between Real and Demo session clocks."""

    def test_full_lifecycle_sequence_equivalence(self):
        """
        Sequence: [WARNING, WARNING, WARNING, UNUSABLE, CLEAN, CLEAN]
        Must produce identical state sequence under both Real and Demo clocks.
        """
        sequence = ["WARNING", "WARNING", "WARNING", "UNUSABLE", "CLEAN", "CLEAN"]

        # Run Real clock
        sm_real = ObservationStateMachine(is_demo=False)
        real_history: List[Dict[str, Any]] = []
        for step in sequence:
            segs = make_normalized_scenario_segments(is_demo=False, scenario_type=step)
            win = WindowEvaluator.evaluate_segments(segs, is_demo=False)
            res = sm_real.evaluate_window(win)
            real_history.append(res)

        # Run Demo clock
        sm_demo = ObservationStateMachine(is_demo=True)
        demo_history: List[Dict[str, Any]] = []
        for step in sequence:
            segs = make_normalized_scenario_segments(is_demo=True, scenario_type=step)
            win = WindowEvaluator.evaluate_segments(segs, is_demo=True)
            res = sm_demo.evaluate_window(win)
            demo_history.append(res)

        # Verify step-by-step equivalence
        assert len(real_history) == len(demo_history) == 6

        for i, (r_step, d_step) in enumerate(zip(real_history, demo_history)):
            # Observation state and classification match
            assert r_step["observation_state"] == d_step["observation_state"], f"Step {i} observation mismatch"
            assert r_step["classification"] == d_step["classification"], f"Step {i} classification mismatch"

            # Attention pattern and case state match exactly
            assert r_step["attention_pattern"] == d_step["attention_pattern"], f"Step {i} attention mismatch"
            assert r_step["case_state"] == d_step["case_state"], f"Step {i} case state mismatch"

            # Streaks match
            assert r_step["warning_streak"] == d_step["warning_streak"], f"Step {i} warning streak mismatch"
            assert r_step["clean_streak"] == d_step["clean_streak"], f"Step {i} clean streak mismatch"

            # Transition flags match
            assert r_step["escalated"] == d_step["escalated"], f"Step {i} escalation flag mismatch"
            assert r_step["recovered"] == d_step["recovered"], f"Step {i} recovery flag mismatch"

        # Verify expected semantic milestones
        # Step 0: 1st warning -> VARIABLE, SELF_RECOVERY
        assert real_history[0]["case_state"] == "SELF_RECOVERY"
        assert real_history[0]["attention_pattern"] == "VARIABLE"

        # Step 1: 2nd warning -> VARIABLE, MONITOR
        assert real_history[1]["case_state"] == "MONITOR"
        assert real_history[1]["attention_pattern"] == "VARIABLE"

        # Step 2: 3rd warning -> SUSTAINED_CONCERN, ACTION_REQUIRED
        assert real_history[2]["case_state"] == "ACTION_REQUIRED"
        assert real_history[2]["attention_pattern"] == "SUSTAINED_CONCERN"

        # Step 3: NO_DATA -> paused, no recovery
        assert real_history[3]["observation_state"] == "NO_DATA"
        assert real_history[3]["warning_streak"] == 3
        assert real_history[3]["recovered"] is False

        # Step 4: 1st clean -> partial recovery (VARIABLE, clean_streak = 1)
        assert real_history[4]["clean_streak"] == 1
        assert real_history[4]["attention_pattern"] == "VARIABLE"
        assert real_history[4]["recovered"] is False

        # Step 5: 2nd clean -> stable recovery (STABLE, RESOLVED, clean_streak = 2, warning_streak = 0)
        assert real_history[5]["clean_streak"] == 2
        assert real_history[5]["warning_streak"] == 0
        assert real_history[5]["attention_pattern"] == "STABLE"
        assert real_history[5]["case_state"] == "RESOLVED"
        assert real_history[5]["recovered"] is True

    def test_single_warning_never_creates_persistent_concern_in_either_clock(self):
        """A single warning window never triggers SUSTAINED_CONCERN or ACTION_REQUIRED."""
        for is_demo in (False, True):
            sm = ObservationStateMachine(is_demo=is_demo)
            segs = make_normalized_scenario_segments(is_demo=is_demo, scenario_type="WARNING")
            win = WindowEvaluator.evaluate_segments(segs, is_demo=is_demo)
            res = sm.evaluate_window(win)

            assert res["attention_pattern"] == "VARIABLE"
            assert res["case_state"] == "SELF_RECOVERY"
            assert res["warning_streak"] == 1
            assert res["attention_pattern"] != "SUSTAINED_CONCERN"
            assert res["case_state"] != "ACTION_REQUIRED"
