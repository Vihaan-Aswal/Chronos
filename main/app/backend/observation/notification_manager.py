"""
Chronos Pure Notification Policy & Cooldown Tracker
Domain Subsystem: Observation & State Machine
Workstream W7: Student Health and Teacher Triage
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional, Set, Tuple, Union

from .config import get_config


def _ensure_utc(dt: Optional[Union[datetime, str]]) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    try:
        parsed = datetime.fromisoformat(str(dt).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except Exception:
        return datetime.now(timezone.utc)


class NotificationPolicyTracker:
    """
    Pure in-memory and state-evaluating notification cooldown coordinator.
    Enforces:
    - Student technical reminder cooldown: max once per category every 5 minutes (20s demo).
    - Teacher persistent-case notification: dispatched once per case when persistent;
      suppresses repeated alerts while open; requires 10-minute cooldown (30s demo) for new case.
    """

    def __init__(self):
        # (participant_id, category) -> last_notified_datetime
        self._student_reminders: Dict[Tuple[str, str], datetime] = {}
        # set of case_ids already alerted to teacher
        self._notified_teacher_cases: Set[str] = set()
        # session_id -> last_teacher_notification_datetime
        self._last_teacher_notification: Dict[str, datetime] = {}

    def can_notify_student(
        self,
        participant_id: str,
        category: str,
        timestamp: Optional[Union[datetime, str]] = None,
        is_demo: bool = False,
    ) -> Tuple[bool, float]:
        """
        Evaluates whether a student technical reminder banner can be displayed.
        Returns (can_notify, retry_after_sec).
        """
        now = _ensure_utc(timestamp)
        config = get_config(is_demo=is_demo)
        cooldown_sec = config.student_reminder_cooldown_sec

        key = (participant_id, category)
        last_time = self._student_reminders.get(key)
        if last_time is None:
            self._student_reminders[key] = now
            return True, 0.0

        elapsed = (now - last_time).total_seconds()
        if elapsed >= cooldown_sec:
            self._student_reminders[key] = now
            return True, 0.0

        remaining = round(cooldown_sec - elapsed, 2)
        return False, remaining

    def can_notify_teacher(
        self,
        session_id: str,
        case_id: str,
        timestamp: Optional[Union[datetime, str]] = None,
        is_persistent: bool = True,
        is_demo: bool = False,
    ) -> Tuple[bool, float]:
        """
        Evaluates whether a teacher persistent-case notification can be dispatched.
        Rules:
        - Only persistent cases (warning streak >= 3, persistent tech, or ACTION_REQUIRED).
        - Dispatched at most ONCE per case_id.
        - Session-wide cooldown between distinct new case notifications (600s real / 30s demo).
        """
        if not is_persistent:
            return False, 0.0

        now = _ensure_utc(timestamp)
        config = get_config(is_demo=is_demo)
        cooldown_sec = config.teacher_notification_cooldown_sec

        # 1. Check if case was already alerted
        if case_id in self._notified_teacher_cases:
            # Case already notified; suppress repeated alerts while open
            return False, 0.0

        # 2. Check session-wide new case cooldown
        last_session_time = self._last_teacher_notification.get(session_id)
        if last_session_time is not None:
            elapsed = (now - last_session_time).total_seconds()
            if elapsed < cooldown_sec:
                remaining = round(cooldown_sec - elapsed, 2)
                return False, remaining

        # Grant notification and record state
        self._notified_teacher_cases.add(case_id)
        self._last_teacher_notification[session_id] = now
        return True, 0.0

    def reset_case(self, case_id: str) -> None:
        """Removes a case from the notified set upon resolution or reset."""
        self._notified_teacher_cases.discard(case_id)

    def reset_session(self, session_id: str) -> None:
        """Clears tracking for a session."""
        self._last_teacher_notification.pop(session_id, None)
