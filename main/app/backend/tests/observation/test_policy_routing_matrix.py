"""
Chronos Policy Routing Matrix Tests
Domain Subsystem: Observation & State Machine

Verifies the policy routing matrix across all four authoritative presets:
1. CLASSROOM:
   - Attention signals: Supportive context.
   - Teacher alerts: Major technical issues only (warning streaks do not create ACTION_REQUIRED teacher tasks).
   - Priority downgraded to STUDENT_ONLY/MONITOR.
2. RESOURCE_SUPPORTED_ASSESSMENT:
   - Attention signals: Review context.
   - Warning streak >= 3 creates ACTION_REQUIRED for teacher review.
   - Declared resource context enabled.
3. SUPERVISED_ASSESSMENT:
   - Attention signals: Review context.
   - Warning streak >= 3 creates ACTION_REQUIRED review cue.
   - High-sensitivity triage cues.
4. NO_ANALYTICS:
   - Attention signals: OFF.
   - Telemetry completely bypassed (returns UNKNOWN attention, NONE case state, suppresses cases).
"""
import pytest
from typing import Any, Dict

from observation.policy_router import PolicyRouter, PolicyId
from observation.state_machine import ObservationStateMachine


@pytest.mark.unit
class TestPolicyRoutingMatrix:
    """Tests for PolicyRouter across all 4 presets."""

    def test_classroom_policy_suppresses_teacher_tasks(self):
        """Under CLASSROOM, warning streak >= 3 is routed as MONITOR / STUDENT_ONLY, not ACTION_REQUIRED."""
        state = {
            "observation_state": "VALID",
            "classification": "VALID_WARNING",
            "attention_pattern": "SUSTAINED_CONCERN",
            "case_state": "ACTION_REQUIRED",
            "warning_streak": 3,
            "clean_streak": 0,
        }
        routed = PolicyRouter.route_window_state(state, PolicyId.CLASSROOM)
        assert routed["teacher_action_required"] is False
        assert routed["case_state"] == "MONITOR"
        assert routed["priority"] == "STUDENT_ONLY"
        assert routed["student_prompt_enabled"] is True
        assert routed["analytics_enabled"] is True

    def test_resource_supported_assessment_routes_action_required(self):
        """Under RESOURCE_SUPPORTED_ASSESSMENT, warning streak >= 3 requires teacher action."""
        state = {
            "observation_state": "VALID",
            "classification": "VALID_WARNING",
            "attention_pattern": "SUSTAINED_CONCERN",
            "case_state": "ACTION_REQUIRED",
            "warning_streak": 3,
            "clean_streak": 0,
        }
        routed = PolicyRouter.route_window_state(state, PolicyId.RESOURCE_SUPPORTED_ASSESSMENT)
        assert routed["teacher_action_required"] is True
        assert routed["case_state"] == "ACTION_REQUIRED"
        assert routed["priority"] == "ACTION_REQUIRED"
        assert routed["student_prompt_enabled"] is True
        assert routed["analytics_enabled"] is True

    def test_supervised_assessment_routes_immediate_review(self):
        """Under SUPERVISED_ASSESSMENT, warning streak >= 3 creates ACTION_REQUIRED."""
        state = {
            "observation_state": "VALID",
            "classification": "VALID_WARNING",
            "attention_pattern": "SUSTAINED_CONCERN",
            "case_state": "ACTION_REQUIRED",
            "warning_streak": 3,
            "clean_streak": 0,
        }
        routed = PolicyRouter.route_window_state(state, PolicyId.SUPERVISED_ASSESSMENT)
        assert routed["teacher_action_required"] is True
        assert routed["priority"] == "ACTION_REQUIRED"
        assert routed["analytics_enabled"] is True

    def test_no_analytics_policy_completely_disables_attention(self):
        """Under NO_ANALYTICS, attention signals and cases are completely suppressed."""
        state = {
            "observation_state": "VALID",
            "classification": "VALID_WARNING",
            "attention_pattern": "SUSTAINED_CONCERN",
            "case_state": "ACTION_REQUIRED",
            "warning_streak": 3,
            "clean_streak": 0,
        }
        routed = PolicyRouter.route_window_state(state, PolicyId.NO_ANALYTICS)
        assert routed["analytics_enabled"] is False
        assert routed["attention_pattern"] == "UNKNOWN"
        assert routed["attention_state"] == "UNKNOWN"
        assert routed["case_state"] == "NONE"
        assert routed["teacher_action_required"] is False
        assert routed["student_prompt_enabled"] is False

    def test_route_attention_case_suppressed_in_no_analytics(self):
        """Case creation for attention is suppressed in NO_ANALYTICS."""
        case_data = {
            "case_id": "case-test-attention",
            "category": "ATTENTION_CONCERN",
            "priority": "ACTION_REQUIRED",
            "status": "OPEN",
        }
        routed = PolicyRouter.route_attention_case(case_data, PolicyId.NO_ANALYTICS)
        assert routed is None

    def test_route_attention_case_downgraded_in_classroom(self):
        """Case creation for attention is downgraded in CLASSROOM."""
        case_data = {
            "case_id": "case-test-attention",
            "category": "ATTENTION_CONCERN",
            "priority": "ACTION_REQUIRED",
            "status": "OPEN",
        }
        routed = PolicyRouter.route_attention_case(case_data, PolicyId.CLASSROOM)
        assert routed is not None
        assert routed["priority"] == "STUDENT_ONLY"
        assert routed["status"] == "MONITOR"
