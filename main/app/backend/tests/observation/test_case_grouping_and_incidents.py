"""
Chronos Case Grouping & Incident Correlation Tests
Domain Subsystem: Observation & State Machine

Verifies:
- 10 repeated camera disconnect events for 1 participant -> 1 grouped TECHNICAL_CAMERA case.
- 2 valid clean windows -> automatic resolution of active attention case.
- Correlated multi-student technical incident -> 1 session-level SESSION_INCIDENT case instead of individual alerts.
- Student context added attaches without deleting history.
- Teacher batch resolution resolves targeted cases.
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List
import pytest

from observation.case_manager import CaseManager


@pytest.mark.unit
class TestCaseGroupingAndIncidentCorrelation:
    """Tests for participant-level case grouping and session-wide incident correlation."""

    def test_ten_repeated_camera_events_produce_single_grouped_case(self):
        """10 camera disconnect events for student-01 produce 1 TECHNICAL_CAMERA case containing all 10 event IDs."""
        events: List[Dict[str, Any]] = []
        base_time = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)

        for i in range(10):
            evt_time = base_time + timedelta(seconds=i * 10)
            events.append({
                "event_id": f"evt-cam-{i+1:03d}",
                "event_type": "CAMERA_STATE_CHANGED",
                "participant_id": "usr-student-01",
                "occurred_at": evt_time.isoformat(),
                "server_sequence": i + 1,
                "payload": {"is_usable": False, "reason": "CAMERA_UNAVAILABLE"},
            })

        cases = CaseManager.build_session_cases(events, session_id="ses-001")
        # Filter participant cases
        participant_cases = [c for c in cases if c.get("participant_id") == "usr-student-01"]
        assert len(participant_cases) == 1
        cam_case = participant_cases[0]
        assert cam_case["category"] == "TECHNICAL_CAMERA"
        assert len(cam_case["event_ids"]) == 10
        assert cam_case["status"] == "OPEN"
        assert cam_case["priority"] == "MONITOR"

    def test_two_clean_windows_auto_resolve_attention_case(self):
        """Warning window creates attention case; 2 subsequent clean windows automatically resolve it."""
        events: List[Dict[str, Any]] = []
        base_time = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)

        # 1 warning window
        events.append({
            "event_id": "evt-win-01",
            "event_type": "WINDOW_FINALIZED",
            "participant_id": "usr-student-01",
            "occurred_at": base_time.isoformat(),
            "server_sequence": 1,
            "payload": {"classification": "VALID_WARNING", "clean_streak": 0, "warning_streak": 1},
        })

        # 1st clean window (partial recovery, clean_streak = 1)
        events.append({
            "event_id": "evt-win-02",
            "event_type": "WINDOW_FINALIZED",
            "participant_id": "usr-student-01",
            "occurred_at": (base_time + timedelta(seconds=60)).isoformat(),
            "server_sequence": 2,
            "payload": {"classification": "VALID_CLEAN", "clean_streak": 1, "warning_streak": 1},
        })

        # 2nd clean window (stable recovery, clean_streak = 2)
        events.append({
            "event_id": "evt-win-03",
            "event_type": "WINDOW_FINALIZED",
            "participant_id": "usr-student-01",
            "occurred_at": (base_time + timedelta(seconds=120)).isoformat(),
            "server_sequence": 3,
            "payload": {"classification": "VALID_CLEAN", "clean_streak": 2, "warning_streak": 0},
        })

        cases = CaseManager.build_session_cases(events, session_id="ses-001")
        att_cases = [c for c in cases if c.get("category") == "ATTENTION_CONCERN"]
        assert len(att_cases) == 1
        assert att_cases[0]["status"] == "RESOLVED"
        assert att_cases[0]["self_recovery_attempted"] is True

    def test_correlated_network_incident_detection(self):
        """4 students experiencing network disconnect within 60s trigger a single SESSION_INCIDENT case."""
        events: List[Dict[str, Any]] = []
        base_time = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)

        for i, pid in enumerate(["student-01", "student-02", "student-03", "student-04"]):
            evt_time = base_time + timedelta(seconds=i * 5)
            events.append({
                "event_id": f"evt-net-{i+1}",
                "event_type": "NETWORK_STATE_CHANGED",
                "participant_id": pid,
                "occurred_at": evt_time.isoformat(),
                "server_sequence": i + 1,
                "payload": {"is_usable": False, "reason": "NETWORK_DISCONNECTED"},
            })

        cases = CaseManager.build_session_cases(events, session_id="ses-001", total_participants=20)
        session_incidents = [c for c in cases if c.get("category") == "SESSION_INCIDENT"]
        assert len(session_incidents) == 1
        incident = session_incidents[0]
        assert incident["participant_id"] is None
        assert incident["status"] == "OPEN"
        assert incident["priority"] == "URGENT"
        assert incident["affected_participant_count"] == 4
        assert len(incident["event_ids"]) == 4

    def test_student_context_annotates_existing_cases(self):
        """STUDENT_CONTEXT_ADDED increments student_context_count on participant cases."""
        events: List[Dict[str, Any]] = [
            {
                "event_id": "evt-cam-01",
                "event_type": "CAMERA_STATE_CHANGED",
                "participant_id": "student-01",
                "occurred_at": "2026-08-20T10:00:00Z",
                "server_sequence": 1,
                "payload": {"is_usable": False, "reason": "CAMERA_UNAVAILABLE"},
            },
            {
                "event_id": "evt-ctx-01",
                "event_type": "STUDENT_CONTEXT_ADDED",
                "participant_id": "student-01",
                "occurred_at": "2026-08-20T10:01:00Z",
                "server_sequence": 2,
                "payload": {"appeal_category": "CAMERA_LIGHTING_DEVICE", "requested_help": False},
            },
        ]
        cases = CaseManager.build_session_cases(events, session_id="ses-001")
        cam_cases = [c for c in cases if c.get("category") == "TECHNICAL_CAMERA"]
        assert len(cam_cases) == 1
        assert cam_cases[0]["student_context_count"] == 1

    def test_single_camera_flicker_creates_no_action_required_task(self):
        """A single transient camera event produces priority MONITOR, never ACTION_REQUIRED."""
        events: List[Dict[str, Any]] = [
            {
                "event_id": "evt-flicker-1",
                "event_type": "CAMERA_STATE_CHANGED",
                "participant_id": "usr-student-01",
                "occurred_at": "2026-08-20T10:00:00Z",
                "server_sequence": 1,
                "payload": {"is_usable": False, "reason": "CAMERA_UNAVAILABLE"},
            }
        ]
        cases = CaseManager.build_session_cases(events, session_id="ses-001")
        assert len(cases) == 1
        assert cases[0]["priority"] == "MONITOR"
        assert cases[0]["status"] == "OPEN"

    def test_explicit_help_request_elevated_to_action_required(self):
        """STUDENT_CONTEXT_ADDED with requested_help=True produces a STUDENT_HELP_REQUEST case with ACTION_REQUIRED priority."""
        events: List[Dict[str, Any]] = [
            {
                "event_id": "evt-ctx-help",
                "event_type": "STUDENT_CONTEXT_ADDED",
                "participant_id": "usr-student-05",
                "occurred_at": "2026-08-20T10:05:00Z",
                "server_sequence": 1,
                "payload": {
                    "context_id": "ctx-001",
                    "appeal_category": "SIGNAL_MISMATCH",
                    "explanation_text": "Looking down at my notebook.",
                    "requested_help": True,
                },
            }
        ]
        cases = CaseManager.build_session_cases(events, session_id="ses-001")
        help_cases = [c for c in cases if c.get("category") == "STUDENT_HELP_REQUEST"]
        assert len(help_cases) == 1
        assert help_cases[0]["priority"] == "ACTION_REQUIRED"
        assert help_cases[0]["status"] == "ACTION_REQUIRED"

    def test_batch_action_resolves_at_least_ten_cases(self):
        """A single batch teacher action resolves 12 distinct participant cases atomically."""
        events: List[Dict[str, Any]] = []
        base_time = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)
        target_case_ids: List[str] = []

        # Create 12 camera cases for 12 students
        for i in range(12):
            pid = f"student-{i+1:02d}"
            cid = f"case-{pid[:8]}-technical_camera"
            target_case_ids.append(cid)
            events.append({
                "event_id": f"evt-cam-{i+1}",
                "event_type": "CAMERA_STATE_CHANGED",
                "participant_id": pid,
                "occurred_at": (base_time + timedelta(seconds=i)).isoformat(),
                "server_sequence": i + 1,
                "payload": {"is_usable": False, "reason": "CAMERA_UNAVAILABLE"},
            })

        # Batch resolve all 12 cases
        events.append({
            "event_id": "evt-teacher-batch",
            "event_type": "TEACHER_ACTION_RECORDED",
            "actor_id": "teacher-01",
            "occurred_at": (base_time + timedelta(seconds=60)).isoformat(),
            "server_sequence": 100,
            "payload": {
                "action_type": "dismiss_recovered",
                "target_case_ids": target_case_ids,
                "is_batch": True,
            },
        })

        cases = CaseManager.build_session_cases(events, session_id="ses-001")
        resolved_cases = [c for c in cases if c.get("status") == "RESOLVED"]
        assert len(resolved_cases) == 12
        for c in resolved_cases:
            assert c["teacher_action_count"] == 1
            assert c["resolved_at"] is not None
