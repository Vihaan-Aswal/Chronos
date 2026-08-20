"""
Chronos Pure Observation State Machine
Domain Subsystem: Observation & State Machine
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from .config import ObservationClockConfig, get_config


def _normalize_dt(dt_val: Optional[Union[datetime, str]]) -> Optional[datetime]:
    if dt_val is None:
        return None
    if isinstance(dt_val, str):
        try:
            dt_val = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
        except Exception:
            return None
    if dt_val.tzinfo is None:
        dt_val = dt_val.replace(tzinfo=timezone.utc)
    return dt_val


class ObservationStateMachine:
    """
    Pure, deterministic state machine enforcing Chronos observation invariants:
    1. NO_DATA never becomes warning.
    2. NO_DATA never becomes clean.
    3. NO_DATA never counts as recovery.
    4. Technical intervals never become attention cues.
    5. PAGE_HIDDEN never enters attention exposure.
    6. Identity never changes attention state.
    7. A single sample never creates persistent concern.
    8. Three valid warning windows are required for persistent concern.
    9. Two valid clean windows are required for recovery.
    10. 300s (or config stale timeout) of continuous NO_DATA expires warning streak.
    """

    def __init__(
        self,
        config: Optional[ObservationClockConfig] = None,
        is_demo: bool = False,
        initial_warning_streak: int = 0,
        initial_clean_streak: int = 0,
        initial_attention_pattern: str = "UNKNOWN",
        initial_case_state: str = "NONE",
    ):
        self.config = config or get_config(is_demo=is_demo)
        self.warning_streak: int = initial_warning_streak
        self.clean_streak: int = initial_clean_streak
        self.attention_pattern: str = initial_attention_pattern
        self.case_state: str = initial_case_state
        self.last_valid_window_time: Optional[datetime] = None
        self.no_data_start_time: Optional[datetime] = None
        self.history: List[Dict[str, Any]] = []

    @property
    def attention_state(self) -> str:
        """Alias for attention_pattern for backwards-compatibility."""
        return self.attention_pattern

    @attention_state.setter
    def attention_state(self, value: str) -> None:
        self.attention_pattern = value

    def evaluate_window(
        self,
        window_payload: Dict[str, Any],
        timestamp: Optional[Union[datetime, str]] = None,
    ) -> Dict[str, Any]:
        """
        Pure state step function: (CurrentState, WindowPayload) -> TransitionResult
        """
        current_dt = _normalize_dt(
            timestamp
            or window_payload.get("window_end")
            or window_payload.get("occurred_at")
            or window_payload.get("timestamp")
        )

        stale_expired = False
        # 1. Check stale evidence expiry (Invariant 10: 300s of continuous NO_DATA resets warning streak)
        if self.no_data_start_time is not None and current_dt is not None:
            start_dt = _normalize_dt(self.no_data_start_time)
            if start_dt is not None:
                elapsed_sec = (current_dt - start_dt).total_seconds()
                if elapsed_sec >= self.config.stale_evidence_timeout_sec:
                    self.warning_streak = 0
                    self.no_data_start_time = None
                    stale_expired = True

        obs_state = window_payload.get("observation_state", "VALID")
        classification = window_payload.get("classification", "VALID_CLEAN")

        # 2. Handle NO_DATA / NOT_EVALUATED (Invariants 1, 2, 3)
        if obs_state == "NO_DATA" or classification == "NOT_EVALUATED":
            if self.no_data_start_time is None and current_dt is not None:
                self.no_data_start_time = current_dt

            # Streaks do NOT increment. State is paused.
            result = {
                "observation_state": "NO_DATA",
                "classification": "NOT_EVALUATED",
                "attention_pattern": self.attention_pattern,
                "attention_state": self.attention_pattern,
                "case_state": self.case_state,
                "warning_streak": self.warning_streak,
                "clean_streak": self.clean_streak,
                "escalated": False,
                "recovered": False,
                "stale_expired": stale_expired,
            }
            self.history.append(result)
            return result

        # 3. Handle VALID_WARNING (Invariants 7 & 8: 3 valid warning windows required for persistent concern)
        if classification in ("VALID_WARNING", "WARNING"):
            self.no_data_start_time = None
            self.last_valid_window_time = current_dt
            self.warning_streak += 1
            self.clean_streak = 0

            if self.warning_streak == 1:
                self.attention_pattern = "VARIABLE"
                self.case_state = "SELF_RECOVERY"
            elif self.warning_streak == 2:
                self.attention_pattern = "VARIABLE"
                self.case_state = "MONITOR"
            elif self.warning_streak >= 3:
                self.attention_pattern = "SUSTAINED_CONCERN"
                self.case_state = "ACTION_REQUIRED"

            result = {
                "observation_state": "VALID",
                "classification": "VALID_WARNING",
                "attention_pattern": self.attention_pattern,
                "attention_state": self.attention_pattern,
                "case_state": self.case_state,
                "warning_streak": self.warning_streak,
                "clean_streak": self.clean_streak,
                "escalated": True,
                "recovered": False,
            }
            self.history.append(result)
            return result

        # 4. Handle VALID_CLEAN (Invariant 9: 2 valid clean windows required for recovery)
        elif classification in ("VALID_CLEAN", "CLEAN"):
            self.no_data_start_time = None
            self.last_valid_window_time = current_dt
            self.clean_streak += 1

            if self.clean_streak == 1:
                if self.attention_pattern == "SUSTAINED_CONCERN":
                    self.attention_pattern = "VARIABLE"
            elif self.clean_streak >= 2:
                self.warning_streak = 0
                self.attention_pattern = "STABLE"
                if self.case_state != "NONE":
                    self.case_state = "RESOLVED"

            result = {
                "observation_state": "VALID",
                "classification": "VALID_CLEAN",
                "attention_pattern": self.attention_pattern,
                "attention_state": self.attention_pattern,
                "case_state": self.case_state,
                "warning_streak": self.warning_streak,
                "clean_streak": self.clean_streak,
                "escalated": False,
                "recovered": self.clean_streak >= 2,
            }
            self.history.append(result)
            return result

        return {
            "observation_state": obs_state,
            "classification": classification,
            "attention_pattern": self.attention_pattern,
            "attention_state": self.attention_pattern,
            "case_state": self.case_state,
            "warning_streak": self.warning_streak,
            "clean_streak": self.clean_streak,
            "escalated": False,
            "recovered": False,
        }
