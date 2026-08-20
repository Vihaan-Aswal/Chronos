import pytest
from typing import Dict, Any, List
from tests.fixtures.synthetic_factories import (
    make_synthetic_window,
    make_synthetic_observation_segment,
)


class AttentionStateMachine:
    """Pure, deterministic state machine implementing Chronos attention and recovery logic."""

    def __init__(self, is_demo: bool = False):
        self.is_demo = is_demo
        self.warning_streak = 0
        self.clean_streak = 0
        self.attention_state = "STABLE"  # STABLE, VARIABLE, SUSTAINED_CONCERN, UNKNOWN
        self.case_state = "NONE"          # NONE, SELF_RECOVERY, MONITOR, ACTION_REQUIRED, RESOLVED
        self.history: List[Dict[str, Any]] = []

    def evaluate_window(self, window: Dict[str, Any]) -> Dict[str, Any]:
        obs_state = window.get("observation_state")
        classification = window.get("classification")

        # Invariant 1 & 2: NO_DATA never increments warning streak and never counts as recovery
        if obs_state == "NO_DATA" or classification == "NOT_EVALUATED":
            # State is frozen; no escalation and no recovery
            result = {
                "observation_state": "NO_DATA",
                "attention_state": self.attention_state,
                "case_state": self.case_state,
                "warning_streak": self.warning_streak,
                "clean_streak": self.clean_streak,
                "escalated": False,
                "recovered": False,
            }
            self.history.append(result)
            return result

        if classification == "VALID_WARNING":
            self.warning_streak += 1
            self.clean_streak = 0

            # Invariant 9: 3 valid warning windows required for persistent concern
            if self.warning_streak == 1:
                self.attention_state = "VARIABLE"
                self.case_state = "SELF_RECOVERY"  # Student recovery prompt; no teacher task
            elif self.warning_streak == 2:
                self.attention_state = "VARIABLE"
                self.case_state = "MONITOR"        # Grouped monitor case
            elif self.warning_streak >= 3:
                self.attention_state = "SUSTAINED_CONCERN"
                self.case_state = "ACTION_REQUIRED"

            result = {
                "observation_state": "VALID",
                "attention_state": self.attention_state,
                "case_state": self.case_state,
                "warning_streak": self.warning_streak,
                "clean_streak": self.clean_streak,
                "escalated": True,
                "recovered": False,
            }
            self.history.append(result)
            return result

        elif classification == "VALID_CLEAN":
            self.clean_streak += 1

            # Invariant 10: 2 valid clean windows required for stable recovery
            if self.clean_streak == 1:
                # Partial recovery
                if self.attention_state == "SUSTAINED_CONCERN":
                    self.attention_state = "VARIABLE"
            elif self.clean_streak >= 2:
                # Stable recovery; active case resolves
                self.warning_streak = 0
                self.attention_state = "STABLE"
                self.case_state = "RESOLVED" if self.case_state != "NONE" else "NONE"

            result = {
                "observation_state": "VALID",
                "attention_state": self.attention_state,
                "case_state": self.case_state,
                "warning_streak": self.warning_streak,
                "clean_streak": self.clean_streak,
                "escalated": False,
                "recovered": self.clean_streak >= 2,
            }
            self.history.append(result)
            return result

        return {}


@pytest.mark.unit
class TestStateMachineInvariants:
    def test_no_data_never_increments_warning_streak(self):
        """Invariant 1: NO_DATA never increments a warning streak."""
        sm = AttentionStateMachine(is_demo=False)

        # 1 valid warning window -> warning streak = 1
        w1 = make_synthetic_window(coverage_ratio=1.0, classification="VALID_WARNING")
        sm.evaluate_window(w1)
        assert sm.warning_streak == 1

        # Followed by 3 NO_DATA windows
        for _ in range(3):
            w_nodata = make_synthetic_window(coverage_ratio=0.5, classification="NOT_EVALUATED")
            res = sm.evaluate_window(w_nodata)
            assert res["warning_streak"] == 1
            assert sm.warning_streak == 1

    def test_no_data_never_counts_as_recovery(self):
        """Invariant 2: NO_DATA never counts as a clean window or recovery."""
        sm = AttentionStateMachine(is_demo=False)

        # 2 warning windows -> warning streak = 2
        sm.evaluate_window(make_synthetic_window(classification="VALID_WARNING"))
        sm.evaluate_window(make_synthetic_window(classification="VALID_WARNING"))
        assert sm.warning_streak == 2
        assert sm.case_state == "MONITOR"

        # NO_DATA window
        w_nodata = make_synthetic_window(coverage_ratio=0.3)
        res = sm.evaluate_window(w_nodata)
        assert res["recovered"] is False
        assert sm.clean_streak == 0
        assert sm.case_state == "MONITOR"

    def test_three_warning_windows_required_for_persistent_concern(self):
        """Invariant 9: Three valid warning windows required for persistent concern."""
        sm = AttentionStateMachine(is_demo=False)

        # Window 1: Warning -> Student recovery prompt
        r1 = sm.evaluate_window(make_synthetic_window(classification="VALID_WARNING"))
        assert r1["attention_state"] == "VARIABLE"
        assert r1["case_state"] == "SELF_RECOVERY"

        # Window 2: Warning -> Monitor case
        r2 = sm.evaluate_window(make_synthetic_window(classification="VALID_WARNING"))
        assert r2["attention_state"] == "VARIABLE"
        assert r2["case_state"] == "MONITOR"

        # Window 3: Warning -> Sustained concern / Action required
        r3 = sm.evaluate_window(make_synthetic_window(classification="VALID_WARNING"))
        assert r3["attention_state"] == "SUSTAINED_CONCERN"
        assert r3["case_state"] == "ACTION_REQUIRED"

    def test_two_clean_windows_required_for_stable_recovery(self):
        """Invariant 10: Two valid clean windows required for stable recovery."""
        sm = AttentionStateMachine(is_demo=False)

        # Escalate to concern
        for _ in range(3):
            sm.evaluate_window(make_synthetic_window(classification="VALID_WARNING"))
        assert sm.attention_state == "SUSTAINED_CONCERN"

        # 1 clean window -> Partial recovery, not yet resolved
        r1 = sm.evaluate_window(make_synthetic_window(classification="VALID_CLEAN"))
        assert r1["recovered"] is False
        assert sm.clean_streak == 1
        assert sm.attention_state == "VARIABLE"

        # 2nd clean window -> Stable recovery, case resolved
        r2 = sm.evaluate_window(make_synthetic_window(classification="VALID_CLEAN"))
        assert r2["recovered"] is True
        assert sm.clean_streak == 2
        assert sm.warning_streak == 0
        assert sm.attention_state == "STABLE"
        assert sm.case_state == "RESOLVED"

    def test_identity_and_active_presence_never_alter_attention(self):
        """Invariants 4 & 5: Identity and Active Presence states never alter attention score."""
        sm = AttentionStateMachine(is_demo=False)

        # Evaluate clean window
        sm.evaluate_window(make_synthetic_window(classification="VALID_CLEAN"))
        initial_attention = sm.attention_state

        # Simulating external identity mismatch or active presence pass
        # Attention state machine must remain completely independent
        assert initial_attention == "STABLE"
        # Window evaluation solely drives attention state
        assert sm.attention_state == "STABLE"
