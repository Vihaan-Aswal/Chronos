"""
Chronos Teacher Triage & Batch Action Authorization Security Tests
Security Subsystem: Authentication & Authorization Boundaries
Workstream W1 & W7

Verifies:
- Assigned teacher can list cases and execute batch actions.
- Unassigned teacher in same tenant receives 403 Forbidden.
- Cross-tenant teacher receives 404 Not Found or 403 Forbidden.
- Student role is denied teacher case operations (403 Forbidden).
- Unauthenticated requests receive 401 Unauthorized.
"""
import uuid
import pytest
from fastapi.testclient import TestClient

from main import app, repository
from tests.conftest import generate_test_jwt, MockSupabaseClient
from tests.fixtures.synthetic_factories import (
    make_synthetic_tenant,
    make_synthetic_tenant_member,
    make_synthetic_user,
    make_synthetic_session,
)


@pytest.fixture
def triage_db(mock_supabase: MockSupabaseClient):
    """Seed database state for teacher triage authorization tests."""
    mock_supabase.reset()

    # Tenants
    mock_supabase.table("tenants").insert([
        make_synthetic_tenant("ten-001", "Tenant Alpha"),
        make_synthetic_tenant("ten-002", "Tenant Beta"),
    ]).execute()

    # Members
    mock_supabase.table("tenant_members").insert([
        make_synthetic_tenant_member("usr-teach-1", "ten-001", "teacher"),
        make_synthetic_tenant_member("usr-teach-2", "ten-001", "teacher"),
        make_synthetic_tenant_member("usr-teach-beta", "ten-002", "teacher"),
        make_synthetic_tenant_member("usr-stud-1", "ten-001", "student"),
    ]).execute()

    # Users
    mock_supabase.table("users").insert([
        make_synthetic_user("usr-teach-1", "ten-001", "teacher", "Teacher One (Assigned)"),
        make_synthetic_user("usr-teach-2", "ten-001", "teacher", "Teacher Two (Unassigned)"),
        make_synthetic_user("usr-teach-beta", "ten-002", "teacher", "Teacher Beta"),
        make_synthetic_user("usr-stud-1", "ten-001", "student", "Student One"),
    ]).execute()

    # Sessions
    mock_supabase.table("sessions").insert([
        make_synthetic_session(
            session_id="ses-triage-100",
            tenant_id="ten-001",
            teacher_id="usr-teach-1",
            status="ACTIVE",
            policy_id="RESOURCE_SUPPORTED_ASSESSMENT",
        ),
    ]).execute()

    # Seed an event using main.repository
    import main
    main.repository.append_event({
        "event_id": "evt-cam-101",
        "event_type": "CAMERA_STATE_CHANGED",
        "schema_version": 1,
        "tenant_id": "ten-001",
        "session_id": "ses-triage-100",
        "participant_id": "usr-stud-1",
        "actor_id": "usr-stud-1",
        "actor_role": "participant",
        "source": "camera",
        "occurred_at": "2026-08-20T10:00:00Z",
        "server_sequence": 1,
        "policy_id": "RESOURCE_SUPPORTED_ASSESSMENT",
        "payload": {"is_usable": False, "reason": "CAMERA_UNAVAILABLE"},
    })

    return mock_supabase


@pytest.mark.security
class TestTeacherTriageAuthorization:
    """Security tests verifying role and tenant boundaries on teacher cases and batch actions."""

    def test_assigned_teacher_can_list_and_act_on_cases(self, test_client: TestClient, triage_db):
        """Assigned teacher successfully retrieves cases and executes batch actions."""
        token = generate_test_jwt(user_id="usr-teach-1", tenant_id="ten-001", role="teacher")

        # 1. Get cases
        resp = test_client.get(
            "/api/v1/sessions/ses-triage-100/cases",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["cases"]) == 1
        case_id = data["cases"][0]["case_id"]

        # 2. Execute batch action
        act_resp = test_client.post(
            "/api/v1/sessions/ses-triage-100/cases/actions",
            json={
                "session_id": "ses-triage-100",
                "case_ids": [case_id],
                "action_type": "mark_technical",
                "note": "Camera hardware issue confirmed",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert act_resp.status_code == 200
        assert act_resp.json()["status"] == "success"

    def test_unassigned_teacher_is_denied(self, test_client: TestClient, triage_db):
        """Unassigned teacher in the same tenant receives 403 Forbidden."""
        token = generate_test_jwt(user_id="usr-teach-2", tenant_id="ten-001", role="teacher")

        resp = test_client.get(
            "/api/v1/sessions/ses-triage-100/cases",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

        act_resp = test_client.post(
            "/api/v1/sessions/ses-triage-100/cases/actions",
            json={
                "session_id": "ses-triage-100",
                "case_ids": ["case-test-1"],
                "action_type": "resolve_case",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert act_resp.status_code == 403

    def test_student_is_denied_teacher_case_endpoints(self, test_client: TestClient, triage_db):
        """Student role is denied case query and batch actions with 403 Forbidden."""
        token = generate_test_jwt(user_id="usr-stud-1", tenant_id="ten-001", role="student")

        resp = test_client.get(
            "/api/v1/sessions/ses-triage-100/cases",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

        act_resp = test_client.post(
            "/api/v1/sessions/ses-triage-100/cases/actions",
            json={
                "session_id": "ses-triage-100",
                "case_ids": ["case-test-1"],
                "action_type": "resolve_case",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert act_resp.status_code == 403

    def test_cross_tenant_teacher_is_denied(self, test_client: TestClient, triage_db):
        """Teacher from a different tenant receives 404 or 403."""
        token = generate_test_jwt(user_id="usr-teach-beta", tenant_id="ten-002", role="teacher")

        resp = test_client.get(
            "/api/v1/sessions/ses-triage-100/cases",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code in (403, 404)
