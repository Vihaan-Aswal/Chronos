"""
Unit Tests for Review Prioritization & Prohibited Language Neutrality
Workstream W8: Timeline-Led Reports and Exports
Specification: HACKATHON_PRD.md, LOGIC_AND_EVENT_SPEC.md, PRIVACY_DATA_MODEL.md
"""
import pytest
import json
from reports.engine import ReportEngine
from reports.schemas import ReviewPriorityLevel


PROHIBITED_TERMS = [
    "at risk",
    "at-risk",
    "atrisk",
    "cheating",
    "strikes",
    "disengagement strikes",
    "teacher performance index",
    "tpi",
    "guilt",
    "fraud",
    "penalty",
    "identity violation",
    "identity violations",
    "high risk",
    "medium risk",
]


def test_review_prioritization_ranking_order():
    """Verify learners are ranked by evidence priority level."""
    session = {"session_id": "sess-rank-1", "tenant_id": "ten-1"}
    events = [
        {"event_id": "e1", "session_id": "sess-rank-1", "server_sequence": 1, "event_type": "SESSION_STARTED"},
        # p_action: 3 consecutive warning windows -> warning_streak=3 -> ACTION_REQUIRED
        {"event_id": "e2", "session_id": "sess-rank-1", "server_sequence": 2, "event_type": "WINDOW_FINALIZED", "participant_id": "p_action", "payload": {
            "window_id": "w1", "observation_state": "VALID", "classification": "VALID_WARNING", "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 30.0, "reason_codes": ["LOOKING_AWAY"]
        }},
        {"event_id": "e3", "session_id": "sess-rank-1", "server_sequence": 3, "event_type": "WINDOW_FINALIZED", "participant_id": "p_action", "payload": {
            "window_id": "w2", "observation_state": "VALID", "classification": "VALID_WARNING", "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 30.0, "reason_codes": ["LOOKING_AWAY"]
        }},
        {"event_id": "e4", "session_id": "sess-rank-1", "server_sequence": 4, "event_type": "WINDOW_FINALIZED", "participant_id": "p_action", "payload": {
            "window_id": "w3", "observation_state": "VALID", "classification": "VALID_WARNING", "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 30.0, "reason_codes": ["LOOKING_AWAY"]
        }},
        # p_monitor: 1 warning window -> MONITOR
        {"event_id": "e5", "session_id": "sess-rank-1", "server_sequence": 5, "event_type": "WINDOW_FINALIZED", "participant_id": "p_monitor", "payload": {
            "window_id": "w4", "observation_state": "VALID", "classification": "VALID_WARNING", "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 30.0, "reason_codes": ["LOOKING_AWAY"]
        }},
        # p_stable: clean streak 3 -> STABLE
        {"event_id": "e6", "session_id": "sess-rank-1", "server_sequence": 6, "event_type": "WINDOW_FINALIZED", "participant_id": "p_stable", "payload": {
            "window_id": "w5", "observation_state": "VALID", "classification": "VALID_CLEAN", "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 0.0
        }},
        {"event_id": "e7", "session_id": "sess-rank-1", "server_sequence": 7, "event_type": "SESSION_ENDED"},
    ]

    report = ReportEngine.build_report_read_model(session=session, events=events)
    priorities = [r.priority_level for r in report.review_prioritization]

    assert priorities[0] == ReviewPriorityLevel.ACTION_REQUIRED
    assert priorities[1] == ReviewPriorityLevel.MONITOR
    assert priorities[2] == ReviewPriorityLevel.STABLE


def test_zero_prohibited_verdict_language_in_read_model():
    """Verify that serializing the entire ReportReadModel contains 0 prohibited terms."""
    session = {
        "session_id": "sess-lang-1",
        "tenant_id": "ten-1",
        "title": "Language Neutrality Check",
        "policy_id": "SUPERVISED_ASSESSMENT",
    }
    events = [
        {"event_id": "e1", "session_id": "sess-lang-1", "server_sequence": 1, "event_type": "SESSION_STARTED"},
        {"event_id": "e2", "session_id": "sess-lang-1", "server_sequence": 2, "event_type": "WINDOW_FINALIZED", "participant_id": "p1", "payload": {
            "window_id": "w1", "observation_state": "VALID", "classification": "VALID_WARNING", "expected_segments": 12, "usable_segments": 12, "cue_exposure_seconds": 35.0, "reason_codes": ["LOOKING_AWAY"]
        }},
        {"event_id": "e3", "session_id": "sess-lang-1", "server_sequence": 3, "event_type": "IDENTITY_RESULT", "participant_id": "p1", "payload": {
            "identity_state": "MANUAL_REVIEW", "confidence_score": 0.4
        }},
        {"event_id": "e4", "session_id": "sess-lang-1", "server_sequence": 4, "event_type": "STUDENT_CONTEXT_ADDED", "participant_id": "p1", "payload": {
            "context_id": "ctx-1", "appeal_category": "LIGHTING_OR_DEVICE", "explanation_text": "Room lighting was dim."
        }},
        {"event_id": "e5", "session_id": "sess-lang-1", "server_sequence": 5, "event_type": "SESSION_ENDED"},
    ]

    report = ReportEngine.build_report_read_model(session=session, events=events)
    dumped_str = json.dumps(report.model_dump()).lower()

    found_prohibited = []
    for term in PROHIBITED_TERMS:
        if term in dumped_str:
            found_prohibited.append(term)

    assert not found_prohibited, f"Prohibited verdict terms detected in ReportReadModel: {found_prohibited}"
