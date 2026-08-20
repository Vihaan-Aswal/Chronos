"""
Chronos Browser Visibility & Context Tracking Contract Test Suite
Workstream W4: Local Observation, Browser Context, and Active Presence
Specifications: LOGIC_AND_EVENT_SPEC.md §8, PRIVACY_DATA_MODEL.md §4, POLICY_ASSESSMENT_SPEC.md §4
"""
import uuid
import pytest
from datetime import datetime, timezone
from typing import Dict, Any

from contracts import EventEnvelope, EventType, BrowserVisibilityPayload, PolicyId
from observation.classifier import UsableSegmentClassifier
from observation.case_manager import CaseManager
from projections.engine import ProjectionEngine
from tests.fixtures.event_factories import make_synthetic_browser_visibility_payload


@pytest.mark.contract
class TestBrowserVisibilityContracts:
    """Contract tests for browser visibility intervals and invariants."""

    def test_browser_visibility_payload_valid(self):
        """BrowserVisibilityPayload enforces started_at, ended_at, duration_ms, and destination_known: False."""
        p = BrowserVisibilityPayload(
            started_at="2026-08-20T10:00:00Z",
            ended_at="2026-08-20T10:01:00Z",
            duration_ms=60000,
            visibility_state="HIDDEN",
            destination_known=False,
            declared_resource_opened_recently=True,
            associated_declared_resource_id="res-001",
        )
        assert p.duration_ms == 60000
        assert p.destination_known is False
        assert p.declared_resource_opened_recently is True
        assert p.associated_declared_resource_id == "res-001"

    def test_destination_known_cannot_be_true(self):
        """Privacy Invariant: destination_known must always be False (never fabricated or guessed)."""
        with pytest.raises(Exception):
            BrowserVisibilityPayload(
                started_at="2026-08-20T10:00:00Z",
                destination_known=True,  # Prohibited
            )

    def test_page_hidden_never_enters_attention_exposure(self):
        """Domain Invariant 5: PAGE_HIDDEN / blur segments are usable but never count as cue_away."""
        seg_hidden = UsableSegmentClassifier.classify_segment({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
            "pose_confidence": 0.95,
            "yaw_deg": 35.0,  # Would normally be orientation away
            "pitch_deg": 25.0,
            "browser_context": "PAGE_HIDDEN",
        })
        assert seg_hidden.usable is True
        assert seg_hidden.cue_away is False
        assert seg_hidden.attention_reasons == []

        seg_blurred = UsableSegmentClassifier.classify_segment({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
            "pose_confidence": 0.95,
            "yaw_deg": 35.0,
            "browser_context": "WINDOW_BLURRED",
        })
        assert seg_blurred.usable is True
        assert seg_blurred.cue_away is False

    def test_browser_context_projection_reduction(self):
        """Projection engine tracks active browser context state deterministically."""
        initial = {
            "browser_context": "NO_ACTIVE_EVENT",
            "observation_state": "OBSERVABLE",
        }

        # Page hidden
        evt1 = {
            "event_type": "PAGE_HIDDEN",
            "payload": {"visibility_state": "HIDDEN", "duration_ms": 5000},
        }
        s1 = ProjectionEngine.reduce_participant_event(initial, evt1)
        assert s1["browser_context"] == "PAGE_HIDDEN"

        # Page visible restores NO_ACTIVE_EVENT
        evt2 = {
            "event_type": "PAGE_VISIBLE",
            "payload": {"visibility_state": "VISIBLE"},
        }
        s2 = ProjectionEngine.reduce_participant_event(s1, evt2)
        assert s2["browser_context"] == "NO_ACTIVE_EVENT"

    def test_no_analytics_policy_suppresses_browser_cases(self):
        """Policy Router suppresses BROWSER_VISIBILITY cases completely under NO_ANALYTICS."""
        events = [
            {
                "event_type": "PAGE_HIDDEN",
                "participant_id": "usr-01",
                "occurred_at": "2026-08-20T10:00:00Z",
                "payload": {"duration_ms": 70000, "destination_known": False},
            }
        ]
        cases_no_analytics = CaseManager.build_session_cases(
            events=events,
            session_id="ses-no-analytics",
            policy_id=PolicyId.NO_ANALYTICS,
        )
        assert len(cases_no_analytics) == 0

        # In CLASSROOM, case is generated as informational (MONITOR/STUDENT_ONLY)
        cases_classroom = CaseManager.build_session_cases(
            events=events,
            session_id="ses-classroom",
            policy_id=PolicyId.CLASSROOM,
        )
        assert len(cases_classroom) == 1
        assert cases_classroom[0]["priority"] in ("MONITOR", "STUDENT_ONLY")
        assert cases_classroom[0]["status"] in ("OPEN", "MONITOR")
