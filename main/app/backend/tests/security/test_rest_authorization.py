"""
Security Integration Test Suite: REST API Authorization & Tenancy Boundaries.
Guarantees strict tenant isolation, role enforcement, ID tampering rejection, and admission lifecycle.
"""
import pytest
from fastapi.testclient import TestClient
from main import app
from tests.conftest import generate_test_jwt, MockSupabaseClient
from tests.fixtures.synthetic_factories import (
    make_synthetic_tenant,
    make_synthetic_tenant_member,
    make_synthetic_user,
    make_synthetic_session,
)


@pytest.fixture
def populated_db(mock_supabase: MockSupabaseClient):
    """Seed multi-tenant database state for authorization testing."""
    mock_supabase.reset()

    # Tenants
    mock_supabase.table("tenants").insert([
        make_synthetic_tenant("ten-001", "Tenant Alpha"),
        make_synthetic_tenant("ten-002", "Tenant Beta"),
    ]).execute()

    # Tenant Members
    mock_supabase.table("tenant_members").insert([
        make_synthetic_tenant_member("usr-teach-1", "ten-001", "teacher"),
        make_synthetic_tenant_member("usr-teach-2", "ten-001", "teacher"),
        make_synthetic_tenant_member("usr-teach-beta", "ten-002", "teacher"),
        make_synthetic_tenant_member("usr-stud-1", "ten-001", "student"),
        make_synthetic_tenant_member("usr-stud-2", "ten-001", "student"),
        make_synthetic_tenant_member("usr-stud-beta", "ten-002", "student"),
    ]).execute()

    # Users (legacy fallback table)
    mock_supabase.table("users").insert([
        make_synthetic_user("usr-teach-1", "ten-001", "teacher", "Teacher One"),
        make_synthetic_user("usr-teach-2", "ten-001", "teacher", "Teacher Two (Unassigned)"),
        make_synthetic_user("usr-teach-beta", "ten-002", "teacher", "Teacher Beta"),
        make_synthetic_user("usr-stud-1", "ten-001", "student", "Student One (Enrolled)"),
        make_synthetic_user("usr-stud-2", "ten-001", "student", "Student Two (Not Enrolled)"),
        make_synthetic_user("usr-stud-beta", "ten-002", "student", "Student Beta"),
    ]).execute()

    # Sessions
    mock_supabase.table("sessions").insert([
        make_synthetic_session(
            session_id="ses-alpha-active",
            tenant_id="ten-001",
            teacher_id="usr-teach-1",
            status="ACTIVE",
        ),
        make_synthetic_session(
            session_id="ses-alpha-ended",
            tenant_id="ten-001",
            teacher_id="usr-teach-1",
            status="ENDED",
        ),
        make_synthetic_session(
            session_id="ses-beta-active",
            tenant_id="ten-002",
            teacher_id="usr-teach-beta",
            status="ACTIVE",
        ),
    ]).execute()

    # Session Participants (Roster Membership)
    mock_supabase.table("session_participants").insert([
        {"session_id": "ses-alpha-active", "user_id": "usr-stud-1", "tenant_id": "ten-001", "status": "ADMITTED", "role": "student"},
        {"session_id": "ses-alpha-ended", "user_id": "usr-stud-1", "tenant_id": "ten-001", "status": "COMPLETED", "role": "student"},
        {"session_id": "ses-beta-active", "user_id": "usr-stud-beta", "tenant_id": "ten-002", "status": "ADMITTED", "role": "student"},
    ]).execute()

    # Consent records
    mock_supabase.table("consent_records").insert([
        {
            "consent_id": "c-stud-1",
            "tenant_id": "ten-001",
            "subject_id": "usr-stud-1",
            "scope": "IDENTITY_ENROLLMENT",
            "grant_or_decline": "GRANT",
            "policy_version": "v1",
            "granted_at": "2026-08-20T10:00:00Z",
            "actor_type": "student",
        }
    ]).execute()

    return mock_supabase


@pytest.mark.security
class TestRESTAuthorization:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    # 1. Unauthenticated Request -> 401
    def test_unauthenticated_request_rejected(self, client):
        response = client.post(
            "/teacher/action",
            json={
                "session_id": "ses-alpha-active",
                "user_id": "usr-stud-1",
                "action": "mark_engaged",
            },
        )
        assert response.status_code == 401

    # 2. Expired Token -> 401
    def test_expired_token_rejected(self, client):
        token = generate_test_jwt(
            user_id="usr-teach-1",
            tenant_id="ten-001",
            role="teacher",
            expires_in_seconds=-30,
        )
        response = client.post(
            "/teacher/action",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "session_id": "ses-alpha-active",
                "user_id": "usr-stud-1",
                "action": "mark_engaged",
            },
        )
        assert response.status_code == 401

    # 3. Wrong Role: Student attempting teacher action -> 403
    def test_student_cannot_execute_teacher_action(self, client, populated_db):
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/teacher/action",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "session_id": "ses-alpha-active",
                "user_id": "usr-stud-1",
                "action": "mark_engaged",
            },
        )
        assert response.status_code == 403
        assert "forbidden" in response.text.lower() or "role" in response.text.lower()

    def test_student_cannot_trigger_liveness(self, client, populated_db):
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/liveness/trigger",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"session_id": "ses-alpha-active", "user_id": "usr-stud-1"},
        )
        assert response.status_code == 403

    def test_student_cannot_set_session_mode(self, client, populated_db):
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/session/set-mode",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"session_id": "ses-alpha-active", "mode": "strict"},
        )
        assert response.status_code == 403

    # 4. Wrong Tenant: Cross-tenant session access -> 403 / 404
    def test_cross_tenant_teacher_access_denied(self, client, populated_db):
        # Teacher from Tenant Beta attempts to access Tenant Alpha session
        teacher_beta_token = generate_test_jwt(
            user_id="usr-teach-beta", tenant_id="ten-002", role="teacher"
        )
        response = client.post(
            "/teacher/action",
            headers={"Authorization": f"Bearer {teacher_beta_token}"},
            json={
                "session_id": "ses-alpha-active",
                "user_id": "usr-stud-1",
                "action": "mark_engaged",
            },
        )
        assert response.status_code in (403, 404)

    # 5. Unassigned Teacher: Same tenant, but not assigned teacher -> 403
    def test_unassigned_teacher_action_denied(self, client, populated_db):
        # Teacher 2 belongs to Tenant Alpha, but ses-alpha-active is assigned to Teacher 1
        unassigned_teacher_token = generate_test_jwt(
            user_id="usr-teach-2", tenant_id="ten-001", role="teacher"
        )
        response = client.post(
            "/teacher/action",
            headers={"Authorization": f"Bearer {unassigned_teacher_token}"},
            json={
                "session_id": "ses-alpha-active",
                "user_id": "usr-stud-1",
                "action": "mark_engaged",
            },
        )
        assert response.status_code == 403
        assert "not the assigned teacher" in response.text.lower()

    # 6. Non-member Participant Join -> 403 / 404
    def test_non_member_student_cannot_join_session(self, client, populated_db):
        # Student from Tenant Beta attempts to join Tenant Alpha session
        alien_student_token = generate_test_jwt(
            user_id="usr-alien-student", tenant_id="ten-999", role="student"
        )
        response = client.post(
            "/session/ses-alpha-active/admission",
            headers={"Authorization": f"Bearer {alien_student_token}"},
            json={"consent_granted": True},
        )
        assert response.status_code in (403, 404)

    # 7. Expired / Ended Session Admission -> 400 / 403
    def test_admission_into_ended_session_rejected(self, client, populated_db):
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/session/ses-alpha-ended/admission",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"consent_granted": True},
        )
        assert response.status_code in (400, 403)

    # 8. Client-Supplied ID Tampering (Payload user_id != Auth Token sub)
    def test_payload_user_id_tampering_overridden_by_auth_context(
        self, client, populated_db
    ):
        # Student 1 logs in, but supplies Student 2's ID in the payload to register an embedding
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/identity/register",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "user_id": "usr-stud-2",  # Attempted identity spoofing in payload
                "embedding": [0.05] * 128,
            },
        )
        assert response.status_code == 200

        # Verify the DB row was saved under usr-stud-1, NOT usr-stud-2
        res = (
            populated_db.table("identity_embeddings")
            .select("*")
            .eq("user_id", "usr-stud-2")
            .execute()
        )
        assert len(res.data) == 0, "Security Failure: Payload user_id spoofed identity record!"

        res_self = (
            populated_db.table("identity_embeddings")
            .select("*")
            .eq("user_id", "usr-stud-1")
            .execute()
        )
        assert len(res_self.data) == 1, "Self record should be properly saved under auth context user_id"

    # 9. Student querying another user's embedding is denied -> 404
    def test_cross_user_identity_retrieval_denied(self, client, populated_db):
        # Student 1 tries to read Student 2's embedding
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.get(
            "/identity/usr-stud-2",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert response.status_code == 404

    # 10. Session Creation Lifecycle Authorization
    def test_teacher_can_create_session(self, client, populated_db):
        teacher_token = generate_test_jwt(
            user_id="usr-teach-1", tenant_id="ten-001", role="teacher"
        )
        response = client.post(
            "/session/create",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={
                "title": "Mathematics Final Exam",
                "policy_id": "SUPERVISED_ASSESSMENT",
                "is_demo": False,
                "expires_in_minutes": 120,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        session = data["session"]
        assert session["teacher_id"] == "usr-teach-1"
        assert session["tenant_id"] == "ten-001"
        assert session["status"] == "SCHEDULED"

    def test_student_cannot_create_session(self, client, populated_db):
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/session/create",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"title": "Unauthorized Student Session"},
        )
        assert response.status_code == 403

    # 11. Session Start & End Lifecycle Authorization
    def test_assigned_teacher_can_start_and_end_session(self, client, populated_db):
        teacher_token = generate_test_jwt(
            user_id="usr-teach-1", tenant_id="ten-001", role="teacher"
        )
        # Create
        create_res = client.post(
            "/session/create",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"title": "Physics Lab", "policy_id": "CLASSROOM"},
        )
        session_id = create_res.json()["session"]["session_id"]

        # Start
        start_res = client.post(
            f"/session/{session_id}/start",
            headers={"Authorization": f"Bearer {teacher_token}"},
        )
        assert start_res.status_code == 200
        assert start_res.json()["session"]["status"] == "ACTIVE"

        # End
        end_res = client.post(
            f"/session/{session_id}/end",
            headers={"Authorization": f"Bearer {teacher_token}"},
        )
        assert end_res.status_code == 200
        assert end_res.json()["session"]["status"] == "ENDED"

    def test_unassigned_teacher_cannot_start_session(self, client, populated_db):
        teacher_token = generate_test_jwt(
            user_id="usr-teach-1", tenant_id="ten-001", role="teacher"
        )
        create_res = client.post(
            "/session/create",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"title": "Biology Session"},
        )
        session_id = create_res.json()["session"]["session_id"]

        # Other teacher in same tenant attempts to start
        other_teacher_token = generate_test_jwt(
            user_id="usr-teach-2", tenant_id="ten-001", role="teacher"
        )
        start_res = client.post(
            f"/session/{session_id}/start",
            headers={"Authorization": f"Bearer {other_teacher_token}"},
        )
        assert start_res.status_code == 403

    # 12. Teacher Analytics List Derives Identity from AuthContext
    def test_analytics_list_filters_by_authenticated_teacher(self, client, populated_db):
        populated_db.table("session_analytics").insert([
            {
                "id": "ana-1",
                "session_id": "ses-1",
                "teacher_id": "usr-teach-1",
                "start_time": "2026-08-20T10:00:00Z",
                "end_time": "2026-08-20T11:00:00Z",
                "duration_minutes": 60,
                "avg_engagement_score": 85.0,
                "total_students": 10,
            },
            {
                "id": "ana-2",
                "session_id": "ses-2",
                "teacher_id": "usr-teach-2",
                "start_time": "2026-08-20T10:00:00Z",
                "end_time": "2026-08-20T11:00:00Z",
                "duration_minutes": 60,
                "avg_engagement_score": 75.0,
                "total_students": 5,
            },
        ]).execute()

        # Teacher 1 queries with teacher_id=usr-teach-2 in query params
        teacher_token = generate_test_jwt(
            user_id="usr-teach-1", tenant_id="ten-001", role="teacher"
        )
        response = client.get(
            "/session/analytics/list?teacher_id=usr-teach-2",
            headers={"Authorization": f"Bearer {teacher_token}"},
        )
        assert response.status_code == 200
        sessions = response.json()["sessions"]
        # Server MUST only return sessions for usr-teach-1!
        assert len(sessions) == 1
        assert sessions[0]["teacher_id"] == "usr-teach-1"

    def test_save_analytics_derives_teacher_id_from_auth_context(self, client, populated_db):
        teacher_token = generate_test_jwt(
            user_id="usr-teach-1", tenant_id="ten-001", role="teacher"
        )
        response = client.post(
            "/session/save-analytics",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={
                "session_id": "ses-alpha-active",
                "teacher_id": "usr-attacker-spoofed",  # Spoofed in payload
                "start_time": "2026-08-20T10:00:00Z",
                "end_time": "2026-08-20T11:00:00Z",
                "duration_minutes": 60.0,
                "avg_engagement_score": 90.0,
                "total_students": 15,
                "metrics_timeline": [],
            },
        )
        assert response.status_code == 200

        # Check in DB that teacher_id was saved as usr-teach-1, NOT usr-attacker-spoofed
        res = populated_db.table("session_analytics").select("*").eq("session_id", "ses-alpha-active").execute()
        assert len(res.data) >= 1
        assert res.data[0]["teacher_id"] == "usr-teach-1"

    def test_identity_registration_without_consent_rejected(self, client, populated_db):
        """Registering biometric embedding without IDENTITY_ENROLLMENT consent raises 403."""
        # usr-stud-2 has no consent recorded
        student2_token = generate_test_jwt(
            user_id="usr-stud-2", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/identity/register",
            headers={"Authorization": f"Bearer {student2_token}"},
            json={
                "embedding": [0.05] * 128,
            },
        )
        assert response.status_code == 403
        assert "Consent for 'IDENTITY_ENROLLMENT' is required" in response.json()["detail"]

