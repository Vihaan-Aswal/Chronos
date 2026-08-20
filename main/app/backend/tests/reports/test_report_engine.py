"""
Unit & Integration Tests for Chronos ReportEngine
Workstream W8: Timeline-Led Reports and Exports
Specification: HACKATHON_PRD.md, LOGIC_AND_EVENT_SPEC.md, PRIVACY_DATA_MODEL.md
"""
import pytest
from datetime import datetime, timezone
from reports.engine import ReportEngine
from reports.schemas import ReportReadModel, ReviewPriorityLevel


def _create_event(event_type: str, participant_id: str = None, session_id: str = "sess-test", seq: int = 1, payload: dict = None, occurred_at: str = None):
    return {
        "event_id": f"evt-{seq}",
        "session_id": session_id,
        "server_sequence": seq,
        "event_type": event_type,
        "participant_id": participant_id,
        "occurred_at": occurred_at or datetime.now(timezone.utc).isoformat(),
        "payload": payload or {},
    }


def test_report_read_model_minimal():
    session = {
        "session_id": "sess-min-1",
        "tenant_id": "ten-1",
        "teacher_id": "teach-1",
        "title": "Minimal Math Exam",
        "policy_id": "CLASSROOM",
        "policy_version": "v1",
        "status": "ENDED",
    }
    events = [
        _create_event("SESSION_STARTED", seq=1),
        _create_event("SESSION_ENDED", seq=2),
    ]

    report = ReportEngine.build_report_read_model(session=session, events=events)
    assert isinstance(report, ReportReadModel)
    assert report.session_id == "sess-min-1"
    assert report.session_overview.title == "Minimal Math Exam"
    assert report.event_reconciliation.total_events_processed == 2
    assert report.event_reconciliation.counts_by_event_type["SESSION_STARTED"] == 1
    assert report.event_reconciliation.counts_by_event_type["SESSION_ENDED"] == 1


def test_report_no_data_separation_and_coverage():
    """Verify NO_DATA periods are recorded as technical uncertainty and NOT low attention."""
    session = {
        "session_id": "sess-nodata-1",
        "tenant_id": "ten-1",
        "teacher_id": "teach-1",
        "policy_id": "SUPERVISED_ASSESSMENT",
    }
    events = [
        _create_event("SESSION_STARTED", seq=1),
        # Participant 1: 2 clean windows, 1 warning window
        _create_event("WINDOW_FINALIZED", participant_id="p1", seq=2, payload={
            "window_id": "w1", "observation_state": "VALID", "classification": "VALID_CLEAN",
            "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 0.0,
            "warning_streak": 0, "clean_streak": 1
        }),
        _create_event("WINDOW_FINALIZED", participant_id="p1", seq=3, payload={
            "window_id": "w2", "observation_state": "VALID", "classification": "VALID_CLEAN",
            "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 0.0,
            "warning_streak": 0, "clean_streak": 2
        }),
        _create_event("WINDOW_FINALIZED", participant_id="p1", seq=4, payload={
            "window_id": "w3", "observation_state": "VALID", "classification": "VALID_WARNING",
            "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 22.5,
            "warning_streak": 1, "clean_streak": 0, "reason_codes": ["LOOKING_AWAY"]
        }),
        # Participant 2: 1 clean window, 2 NO_DATA windows due to camera failure
        _create_event("WINDOW_FINALIZED", participant_id="p2", seq=5, payload={
            "window_id": "w4", "observation_state": "VALID", "classification": "VALID_CLEAN",
            "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 0.0,
            "warning_streak": 0, "clean_streak": 1
        }),
        _create_event("NO_DATA_ENTERED", participant_id="p2", seq=6, payload={
            "primary_reason": "CAMERA_UNAVAILABLE", "technical_reasons": ["CAMERA_UNAVAILABLE"]
        }),
        _create_event("WINDOW_FINALIZED", participant_id="p2", seq=7, payload={
            "window_id": "w5", "observation_state": "NO_DATA", "classification": "NOT_EVALUATED",
            "expected_segments": 12, "usable_segments": 0, "cue_exposure_seconds": 0.0,
            "warning_streak": 0, "clean_streak": 0, "technical_reasons": ["CAMERA_UNAVAILABLE"]
        }),
        _create_event("WINDOW_FINALIZED", participant_id="p2", seq=8, payload={
            "window_id": "w6", "observation_state": "NO_DATA", "classification": "NOT_EVALUATED",
            "expected_segments": 12, "usable_segments": 0, "cue_exposure_seconds": 0.0,
            "warning_streak": 0, "clean_streak": 0, "technical_reasons": ["CAMERA_UNAVAILABLE"]
        }),
        _create_event("NO_DATA_EXITED", participant_id="p2", seq=9, payload={
            "duration_ms": 120000, "exit_reason": "CAMERA_RESTORED"
        }),
        _create_event("SESSION_ENDED", seq=10),
    ]

    report = ReportEngine.build_report_read_model(session=session, events=events)

    # Check Coverage (p1 has 3 windows, p2 has 3 windows -> total 6)
    assert report.observation_coverage.total_evaluated_windows == 6
    assert report.observation_coverage.valid_clean_windows == 3
    assert report.observation_coverage.valid_warning_windows == 1
    assert report.observation_coverage.no_data_windows == 2

    # Check Technical Uncertainty
    assert report.technical_uncertainty.affected_participant_count == 1
    assert report.technical_uncertainty.total_no_data_duration_sec == 120.0
    assert "CAMERA_UNAVAILABLE" in report.technical_uncertainty.reason_counts

    # Check Review Prioritization
    p2_review = next(r for r in report.review_prioritization if r.participant_id == "p2")
    assert p2_review.priority_level == ReviewPriorityLevel.TECHNICAL_REVIEW
    assert any("Technical uncertainty" in reason for reason in p2_review.evidence_reasons)


def test_report_identity_and_presence_aggregation():
    """Verify Identity outcomes and Active Presence challenge responses are aggregated."""
    session = {"session_id": "sess-ap-1", "tenant_id": "ten-1"}
    events = [
        _create_event("SESSION_STARTED", seq=1),
        _create_event("IDENTITY_RESULT", participant_id="p1", seq=2, payload={
            "identity_state": "VERIFIED", "confidence_score": 0.95
        }),
        _create_event("IDENTITY_RESULT", participant_id="p2", seq=3, payload={
            "identity_state": "QUALITY_FAIL", "confidence_score": 0.3, "failure_reason": "POOR_LIGHTING"
        }),
        _create_event("ACTIVE_PRESENCE_CHALLENGE_ISSUED", participant_id="p1", seq=4, payload={
            "challenge_id": "c1", "type": "COLOR_SELECTION"
        }),
        _create_event("ACTIVE_PRESENCE_PASSED", participant_id="p1", seq=5, payload={
            "challenge_id": "c1", "elapsed_ms": 2300
        }),
        _create_event("ACTIVE_PRESENCE_CHALLENGE_ISSUED", participant_id="p2", seq=6, payload={
            "challenge_id": "c2", "type": "COLOR_SELECTION"
        }),
        _create_event("ACTIVE_PRESENCE_TIMED_OUT", participant_id="p2", seq=7, payload={
            "challenge_id": "c2"
        }),
        _create_event("SESSION_ENDED", seq=8),
    ]

    report = ReportEngine.build_report_read_model(session=session, events=events)

    # Identity verification
    assert report.identity_outcomes.total_checks == 2
    assert report.identity_outcomes.outcomes_breakdown["VERIFIED"] == 1
    assert report.identity_outcomes.outcomes_breakdown["QUALITY_FAIL"] == 1
    assert "p2" in report.identity_outcomes.participants_requiring_review

    # Active presence verification
    assert report.active_presence.total_challenges_issued == 2
    assert report.active_presence.passed_count == 1
    assert report.active_presence.timed_out_count == 1
    assert report.active_presence.average_completion_ms == 2300.0


def test_report_browser_visibility_and_declared_resources():
    """Verify browser blur intervals are captured with destination_known=False."""
    session = {"session_id": "sess-bv-1", "tenant_id": "ten-1"}
    resources = [
        {"id": "res-1", "title": "Calculus Exam Part 1.pdf", "type": "uploaded_pdf", "is_primary": True, "content_hash": "sha-calc-123"}
    ]
    events = [
        _create_event("SESSION_STARTED", seq=1),
        _create_event("PAGE_HIDDEN", participant_id="p1", seq=2, payload={
            "started_at": "2026-08-20T10:00:00Z", "declared_resource_opened_recently": True, "associated_declared_resource_id": "res-1"
        }),
        _create_event("PAGE_VISIBLE", participant_id="p1", seq=3, payload={
            "ended_at": "2026-08-20T10:00:30Z", "duration_ms": 30000
        }),
        _create_event("SESSION_ENDED", seq=4),
    ]

    report = ReportEngine.build_report_read_model(session=session, events=events, resources=resources)

    assert report.browser_visibility.total_intervals == 1
    assert report.browser_visibility.total_duration_sec == 30.0
    assert report.browser_visibility.destination_known is False
    assert report.browser_visibility.declared_resource_associated_count == 1
    assert report.resource_usage.primary_question_paper["title"] == "Calculus Exam Part 1.pdf"


def test_report_no_analytics_policy_suppression():
    """Verify NO_ANALYTICS preset suppresses behavioral analytics."""
    session = {
        "session_id": "sess-no-analytics",
        "tenant_id": "ten-1",
        "policy_id": "NO_ANALYTICS",
        "policy_version": "v1",
    }
    events = [
        _create_event("SESSION_STARTED", seq=1),
        _create_event("SESSION_ENDED", seq=2),
    ]

    report = ReportEngine.build_report_read_model(session=session, events=events)
    assert report.is_suppressed_by_policy is True
    assert "NO_ANALYTICS" in report.suppression_reason
