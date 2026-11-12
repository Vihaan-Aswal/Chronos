"""
Chronos Notification Cooldown & Policy Unit Tests
Domain Subsystem: Observation & Notification Manager
Workstream W7: Student Health and Teacher Triage

Verifies:
- Student technical reminders enforce 5-minute (300s) cooldown per category in real sessions.
- Student technical reminders enforce 20-second cooldown in demo sessions.
- Teacher persistent notifications are dispatched once per case.
- Repeated alerts for the same open case are suppressed.
- New case notifications enforce 10-minute (600s) cooldown in real sessions (30s in demo).
- Non-persistent cases do not trigger teacher alerts.
"""
from datetime import datetime, timezone, timedelta
import pytest

from observation.notification_manager import NotificationPolicyTracker


@pytest.mark.unit
class TestNotificationCooldowns:
    """Test suite for student and teacher notification policy trackers."""

    def test_student_reminder_cooldown_real_session(self):
        """Student technical reminders have a 300-second cooldown per category in real sessions."""
        tracker = NotificationPolicyTracker()
        t0 = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)

        # First reminder: allowed
        ok, retry_after = tracker.can_notify_student("student-01", "CAMERA_LIGHTING_DEVICE", timestamp=t0, is_demo=False)
        assert ok is True
        assert retry_after == 0.0

        # Immediate repeat (after 30s): blocked
        t1 = t0 + timedelta(seconds=30)
        ok, retry_after = tracker.can_notify_student("student-01", "CAMERA_LIGHTING_DEVICE", timestamp=t1, is_demo=False)
        assert ok is False
        assert retry_after == 270.0

        # Different category (NETWORK_CONNECTIVITY): allowed independently
        ok, retry_after = tracker.can_notify_student("student-01", "NETWORK_CONNECTIVITY", timestamp=t1, is_demo=False)
        assert ok is True

        # Different student (student-02): allowed independently
        ok, retry_after = tracker.can_notify_student("student-02", "CAMERA_LIGHTING_DEVICE", timestamp=t1, is_demo=False)
        assert ok is True

        # After 301s: allowed again for student-01 CAMERA
        t2 = t0 + timedelta(seconds=301)
        ok, retry_after = tracker.can_notify_student("student-01", "CAMERA_LIGHTING_DEVICE", timestamp=t2, is_demo=False)
        assert ok is True

    def test_student_reminder_cooldown_demo_session(self):
        """Student technical reminders have a 20-second cooldown in demo sessions."""
        tracker = NotificationPolicyTracker()
        t0 = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)

        # 1st reminder: allowed
        ok, _ = tracker.can_notify_student("student-01", "CAMERA_LIGHTING_DEVICE", timestamp=t0, is_demo=True)
        assert ok is True

        # At 10s: blocked
        t1 = t0 + timedelta(seconds=10)
        ok, retry_after = tracker.can_notify_student("student-01", "CAMERA_LIGHTING_DEVICE", timestamp=t1, is_demo=True)
        assert ok is False
        assert retry_after == 10.0

        # At 21s: allowed
        t2 = t0 + timedelta(seconds=21)
        ok, _ = tracker.can_notify_student("student-01", "CAMERA_LIGHTING_DEVICE", timestamp=t2, is_demo=True)
        assert ok is True

    def test_teacher_persistent_case_notification_real_session(self):
        """Teacher notification is dispatched once per persistent case; new cases require 600s cooldown."""
        tracker = NotificationPolicyTracker()
        t0 = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)
        sid = "session-001"

        # Non-persistent case: rejected
        ok, _ = tracker.can_notify_teacher(sid, "case-01", timestamp=t0, is_persistent=False, is_demo=False)
        assert ok is False

        # First persistent case: allowed
        ok, retry_after = tracker.can_notify_teacher(sid, "case-01", timestamp=t0, is_persistent=True, is_demo=False)
        assert ok is True
        assert retry_after == 0.0

        # Repeated evaluation for same open case: blocked (no repeated alerts while open)
        t1 = t0 + timedelta(seconds=60)
        ok, retry_after = tracker.can_notify_teacher(sid, "case-01", timestamp=t1, is_persistent=True, is_demo=False)
        assert ok is False

        # Second distinct persistent case at 120s: blocked by 600s session cooldown
        t2 = t0 + timedelta(seconds=120)
        ok, retry_after = tracker.can_notify_teacher(sid, "case-02", timestamp=t2, is_persistent=True, is_demo=False)
        assert ok is False
        assert retry_after == 480.0

        # Second case at 605s: allowed
        t3 = t0 + timedelta(seconds=605)
        ok, _ = tracker.can_notify_teacher(sid, "case-02", timestamp=t3, is_persistent=True, is_demo=False)
        assert ok is True

    def test_teacher_persistent_case_notification_demo_session(self):
        """Teacher notification cooldown in demo sessions is 30 seconds."""
        tracker = NotificationPolicyTracker()
        t0 = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)
        sid = "session-demo"

        # Case 1: allowed
        ok, _ = tracker.can_notify_teacher(sid, "case-01", timestamp=t0, is_persistent=True, is_demo=True)
        assert ok is True

        # Case 2 at 15s: blocked
        t1 = t0 + timedelta(seconds=15)
        ok, retry = tracker.can_notify_teacher(sid, "case-02", timestamp=t1, is_persistent=True, is_demo=True)
        assert ok is False
        assert retry == 15.0

        # Case 2 at 35s: allowed
        t2 = t0 + timedelta(seconds=35)
        ok, _ = tracker.can_notify_teacher(sid, "case-02", timestamp=t2, is_persistent=True, is_demo=True)
        assert ok is True
