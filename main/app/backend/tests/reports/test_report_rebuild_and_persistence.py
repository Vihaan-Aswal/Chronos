"""
Rebuild & Deterministic Equivalence Tests for ReportReadModel
Workstream W8: Timeline-Led Reports and Exports
Specification: HACKATHON_PRD.md, LOGIC_AND_EVENT_SPEC.md
"""
import pytest
import main
from reports.engine import ReportEngine


def test_report_deterministic_replay_equivalence():
    """Verify that replaying identical session events produces 100% identical report values."""
    session = {
        "session_id": "sess-rebuild-det",
        "tenant_id": "ten-rebuild",
        "teacher_id": "teach-1",
        "title": "Deterministic Rebuild Session",
        "policy_id": "CLASSROOM",
    }
    events = [
        {"event_id": "e1", "session_id": "sess-rebuild-det", "server_sequence": 1, "event_type": "SESSION_STARTED", "occurred_at": "2026-08-20T12:00:00Z"},
        {"event_id": "e2", "session_id": "sess-rebuild-det", "server_sequence": 2, "event_type": "WINDOW_FINALIZED", "participant_id": "p1", "payload": {
            "window_id": "w1", "observation_state": "VALID", "classification": "VALID_CLEAN", "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 0.0, "clean_streak": 1, "warning_streak": 0
        }, "occurred_at": "2026-08-20T12:01:00Z"},
        {"event_id": "e3", "session_id": "sess-rebuild-det", "server_sequence": 3, "event_type": "WINDOW_FINALIZED", "participant_id": "p1", "payload": {
            "window_id": "w2", "observation_state": "VALID", "classification": "VALID_WARNING", "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 18.0, "clean_streak": 0, "warning_streak": 1, "reason_codes": ["LOOKING_AWAY"]
        }, "occurred_at": "2026-08-20T12:02:00Z"},
        {"event_id": "e4", "session_id": "sess-rebuild-det", "server_sequence": 4, "event_type": "SESSION_ENDED", "occurred_at": "2026-08-20T12:03:00Z"},
    ]

    report_1 = ReportEngine.build_report_read_model(session=session, events=events)
    report_2 = ReportEngine.build_report_read_model(session=session, events=events)

    # Exclude generated_at and report_id for exact deterministic data comparison
    d1 = report_1.model_dump(exclude={"report_id", "generated_at"})
    d2 = report_2.model_dump(exclude={"report_id", "generated_at"})

    assert d1 == d2


def test_repository_rebuild_projections_populates_report(mock_supabase):
    """Verify repository.rebuild_projections_for_session generates and persists report."""
    repo = main.repository
    sess_id = "sess-repo-test-1"
    session_data = {
        "session_id": sess_id,
        "tenant_id": "ten-repo-1",
        "teacher_id": "teach-1",
        "title": "Repo Rebuild Test",
        "policy_id": "CLASSROOM",
        "policy_version": "v1",
        "status": "ENDED",
    }
    repo.create_session(session_data)

    evt1 = {
        "event_id": "evt-repo-1",
        "session_id": sess_id,
        "tenant_id": "ten-repo-1",
        "server_sequence": 1,
        "event_type": "SESSION_STARTED",
        "occurred_at": "2026-08-20T14:00:00Z",
    }
    evt2 = {
        "event_id": "evt-repo-2",
        "session_id": sess_id,
        "tenant_id": "ten-repo-1",
        "participant_id": "part-repo-1",
        "server_sequence": 2,
        "event_type": "WINDOW_FINALIZED",
        "occurred_at": "2026-08-20T14:01:00Z",
        "payload": {
            "window_id": "w-repo-1",
            "observation_state": "VALID",
            "classification": "VALID_CLEAN",
            "expected_segments": 12,
            "usable_segments": 12,
            "cue_exposure_seconds": 0.0,
            "clean_streak": 1,
            "warning_streak": 0,
        },
    }
    evt3 = {
        "event_id": "evt-repo-3",
        "session_id": sess_id,
        "tenant_id": "ten-repo-1",
        "server_sequence": 3,
        "event_type": "SESSION_ENDED",
        "occurred_at": "2026-08-20T14:02:00Z",
    }
    repo.append_event(evt1)
    repo.append_event(evt2)
    repo.append_event(evt3)

    rebuild_result = repo.rebuild_projections_for_session(sess_id)
    assert rebuild_result["replayed_events_count"] == 3
    assert "report" in rebuild_result

    stored_report = repo.get_report_read_model(sess_id)
    assert stored_report is not None
    assert stored_report["session_id"] == sess_id
    assert stored_report["observation_coverage"]["valid_clean_windows"] == 1
