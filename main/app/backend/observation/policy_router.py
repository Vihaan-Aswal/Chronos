"""
Chronos Policy Router for Observation & Attention
Domain Subsystem: Observation & State Machine
"""
from __future__ import annotations
from typing import Any, Dict, Optional, Union
from enum import Enum


class PolicyId(str, Enum):
    CLASSROOM = "CLASSROOM"
    RESOURCE_SUPPORTED_ASSESSMENT = "RESOURCE_SUPPORTED_ASSESSMENT"
    SUPERVISED_ASSESSMENT = "SUPERVISED_ASSESSMENT"
    NO_ANALYTICS = "NO_ANALYTICS"


class PolicyRouter:
    """
    Pure policy-based routing of state machine outputs and attention cases.
    Enforces privacy, classroom context boundaries, and assessment strictness rules:
    - CLASSROOM: Attention is supportive context; cases are downgraded to STUDENT_ONLY/MONITOR.
    - RESOURCE_SUPPORTED_ASSESSMENT: Warning streak >= 3 creates grouped case for teacher review.
    - SUPERVISED_ASSESSMENT: Warning streak >= 3 creates immediate action-required triage cue.
    - NO_ANALYTICS: Attention telemetry completely disabled/suppressed.
    """

    @staticmethod
    def normalize_policy_id(policy_id: Union[PolicyId, str, Any]) -> str:
        if hasattr(policy_id, "value"):
            val = str(policy_id.value)
        else:
            val = str(policy_id)
        if "." in val:
            val = val.split(".")[-1]
        return val.upper()

    @classmethod
    def is_attention_analytics_enabled(cls, policy_id: Union[PolicyId, str]) -> bool:
        """Returns False if policy disables attention analytics entirely."""
        return cls.normalize_policy_id(policy_id) != PolicyId.NO_ANALYTICS.value

    @classmethod
    def route_window_state(
        cls,
        state: Dict[str, Any],
        policy_id: Union[PolicyId, str],
    ) -> Dict[str, Any]:
        """
        Transforms state machine evaluation results according to policy constraints.
        """
        policy_str = cls.normalize_policy_id(policy_id)
        routed = dict(state)

        # 1. NO_ANALYTICS Policy
        if policy_str == PolicyId.NO_ANALYTICS.value:
            routed["attention_pattern"] = "UNKNOWN"
            routed["attention_state"] = "UNKNOWN"
            routed["case_state"] = "NONE"
            routed["priority"] = "STUDENT_ONLY"
            routed["teacher_action_required"] = False
            routed["student_prompt_enabled"] = False
            routed["analytics_enabled"] = False
            return routed

        routed["analytics_enabled"] = True
        case_state = routed.get("case_state", "NONE")

        # 2. CLASSROOM Policy
        if policy_str == PolicyId.CLASSROOM.value:
            # In classroom mode, teacher action is never required for pure attention
            routed["teacher_action_required"] = False
            routed["student_prompt_enabled"] = True
            if case_state == "ACTION_REQUIRED":
                routed["case_state"] = "MONITOR"
                routed["priority"] = "STUDENT_ONLY"
            elif case_state in ("SELF_RECOVERY", "MONITOR"):
                routed["priority"] = "STUDENT_ONLY"
            else:
                routed["priority"] = "STUDENT_ONLY"
            return routed

        # 3. RESOURCE_SUPPORTED_ASSESSMENT Policy
        elif policy_str == PolicyId.RESOURCE_SUPPORTED_ASSESSMENT.value:
            if case_state == "ACTION_REQUIRED":
                routed["priority"] = "ACTION_REQUIRED"
                routed["teacher_action_required"] = True
                routed["student_prompt_enabled"] = True
            elif case_state == "MONITOR":
                routed["priority"] = "MONITOR"
                routed["teacher_action_required"] = False
                routed["student_prompt_enabled"] = True
            elif case_state == "SELF_RECOVERY":
                routed["priority"] = "STUDENT_ONLY"
                routed["teacher_action_required"] = False
                routed["student_prompt_enabled"] = True
            else:
                routed["priority"] = "STUDENT_ONLY"
                routed["teacher_action_required"] = False
                routed["student_prompt_enabled"] = False
            return routed

        # 4. SUPERVISED_ASSESSMENT Policy
        elif policy_str == PolicyId.SUPERVISED_ASSESSMENT.value:
            if case_state in ("ACTION_REQUIRED", "MONITOR"):
                routed["priority"] = "ACTION_REQUIRED"
                routed["teacher_action_required"] = True
                routed["student_prompt_enabled"] = True
            elif case_state == "SELF_RECOVERY":
                routed["priority"] = "MONITOR"
                routed["teacher_action_required"] = False
                routed["student_prompt_enabled"] = True
            else:
                routed["priority"] = "STUDENT_ONLY"
                routed["teacher_action_required"] = False
                routed["student_prompt_enabled"] = False
            return routed

        return routed

    @classmethod
    def route_attention_case(
        cls,
        case_data: Dict[str, Any],
        policy_id: Union[PolicyId, str],
    ) -> Optional[Dict[str, Any]]:
        """
        Enforces policy restrictions on created or updated teacher triage cases.
        Returns None if the case should be completely suppressed.
        """
        policy_str = cls.normalize_policy_id(policy_id)
        if policy_str == PolicyId.NO_ANALYTICS.value:
            return None

        routed_case = dict(case_data)
        if policy_str == PolicyId.CLASSROOM.value:
            # Downgrade priority and status for classroom supportive mode
            if routed_case.get("priority") == "ACTION_REQUIRED":
                routed_case["priority"] = "STUDENT_ONLY"
                routed_case["status"] = "MONITOR"
        return routed_case
