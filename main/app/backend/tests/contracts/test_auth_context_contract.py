"""
Contract tests for AuthContext, PolicySnapshot, and Domain Lifecycle Models.
"""
import pytest
from auth.context import AuthContext, UserRole, TenantRole, SessionParticipantRole
from models import PolicySnapshot, PolicyId, SessionStatus


@pytest.mark.contract
class TestAuthContextContract:
    def test_auth_context_role_properties(self):
        teacher_ctx = AuthContext(
            user_id="usr-t1",
            tenant_id="ten-1",
            role=UserRole.TEACHER.value,
        )
        assert teacher_ctx.is_teacher is True
        assert teacher_ctx.is_student is False
        assert teacher_ctx.is_admin is False

        student_ctx = AuthContext(
            user_id="usr-s1",
            tenant_id="ten-1",
            role=UserRole.STUDENT.value,
        )
        assert student_ctx.is_teacher is False
        assert student_ctx.is_student is True
        assert student_ctx.is_admin is False

        admin_ctx = AuthContext(
            user_id="usr-a1",
            tenant_id="ten-1",
            role=UserRole.ADMIN.value,
        )
        assert admin_ctx.is_admin is True
        assert admin_ctx.is_teacher is True  # Admin inherits teacher capabilities

        service_ctx = AuthContext(
            user_id="service",
            tenant_id="ten-system",
            role=UserRole.SERVICE_ROLE.value,
            is_service_role=True,
        )
        assert service_ctx.is_teacher is True
        assert service_ctx.is_admin is True

    def test_policy_snapshot_preset_resolution(self):
        # 1. CLASSROOM
        p_class = PolicySnapshot.create_snapshot_for_policy(PolicyId.CLASSROOM)
        assert p_class.camera_required is False
        assert p_class.identity_verification_enabled is False
        assert p_class.active_presence_enabled is False
        assert p_class.attention_signals_enabled is True

        # 2. RESOURCE_SUPPORTED_ASSESSMENT
        p_res = PolicySnapshot.create_snapshot_for_policy(
            PolicyId.RESOURCE_SUPPORTED_ASSESSMENT
        )
        assert p_res.question_paper_required is True
        assert p_res.answer_submission_enabled is True
        assert p_res.active_presence_enabled is True

        # 3. SUPERVISED_ASSESSMENT
        p_sup = PolicySnapshot.create_snapshot_for_policy(
            PolicyId.SUPERVISED_ASSESSMENT
        )
        assert p_sup.camera_required is True
        assert p_sup.identity_verification_enabled is True
        assert p_sup.active_presence_enabled is True
        assert p_sup.answer_submission_enabled is True

        # 4. NO_ANALYTICS
        p_no = PolicySnapshot.create_snapshot_for_policy(PolicyId.NO_ANALYTICS)
        assert p_no.attention_signals_enabled is False
        assert p_no.active_presence_enabled is False
        assert p_no.identity_verification_enabled is False

    def test_demo_mode_accelerates_policy_cooldowns(self):
        normal_p = PolicySnapshot.create_snapshot_for_policy(
            PolicyId.SUPERVISED_ASSESSMENT, is_demo=False
        )
        demo_p = PolicySnapshot.create_snapshot_for_policy(
            PolicyId.SUPERVISED_ASSESSMENT, is_demo=True
        )

        assert normal_p.cooldown_student_sec == 300
        assert demo_p.cooldown_student_sec == 20
        assert normal_p.cooldown_teacher_sec == 600
        assert demo_p.cooldown_teacher_sec == 30
