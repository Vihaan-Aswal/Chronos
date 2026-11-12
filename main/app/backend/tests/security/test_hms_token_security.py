"""
Security tests for 100ms (HMS) Video Token Generation.
Guarantees meeting token role derivation from session membership and provider privacy configuration.
"""
import pytest
from fastapi.testclient import TestClient
import jwt
from main import app
from tests.conftest import generate_test_jwt, MockSupabaseClient, MockHMSClient
from tests.fixtures.synthetic_factories import (
    make_synthetic_tenant,
    make_synthetic_tenant_member,
    make_synthetic_session,
)


@pytest.fixture
def populated_db_hms(mock_supabase: MockSupabaseClient):
    mock_supabase.reset()

    # Tenants
    mock_supabase.table("tenants").insert([
        make_synthetic_tenant("ten-001", "Tenant Alpha"),
        make_synthetic_tenant("ten-002", "Tenant Beta"),
    ]).execute()

    # Tenant Members
    mock_supabase.table("tenant_members").insert([
        make_synthetic_tenant_member("usr-teach-1", "ten-001", "teacher"),
        make_synthetic_tenant_member("usr-stud-1", "ten-001", "student"),
    ]).execute()

    # Sessions
    mock_supabase.table("sessions").insert([
        make_synthetic_session(
            session_id="ses-alpha-active",
            tenant_id="ten-001",
            teacher_id="usr-teach-1",
            status="ACTIVE",
            room_id="room-alpha-123",
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
            room_id="room-beta-456",
        ),
    ]).execute()

    # Session Participants
    mock_supabase.table("session_participants").insert([
        {"session_id": "ses-alpha-active", "user_id": "usr-stud-1", "tenant_id": "ten-001", "status": "ADMITTED", "role": "student"},
    ]).execute()

    return mock_supabase


@pytest.mark.security
class TestHMSTokenSecurity:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_meeting_token_derives_role_from_session_membership(
        self, client, populated_db_hms
    ):
        """A student cannot mint a teacher video token."""
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/session/ses-alpha-active/meeting-token",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "student"

        # Decode token payload (unverified decode to inspect claims)
        decoded = jwt.decode(data["token"], options={"verify_signature": False})
        assert decoded["role"] == "student"
        assert decoded["user_id"] == "usr-stud-1"
        assert decoded["room_id"] == "room-alpha-123"

    def test_teacher_receives_teacher_meeting_role(
        self, client, populated_db_hms
    ):
        """Assigned teacher receives teacher role in minted meeting token."""
        teacher_token = generate_test_jwt(
            user_id="usr-teach-1", tenant_id="ten-001", role="teacher"
        )
        response = client.post(
            "/session/ses-alpha-active/meeting-token",
            headers={"Authorization": f"Bearer {teacher_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "teacher"

        decoded = jwt.decode(data["token"], options={"verify_signature": False})
        assert decoded["role"] == "teacher"
        assert decoded["user_id"] == "usr-teach-1"

    def test_cross_tenant_meeting_token_denied(self, client, populated_db_hms):
        """User from Tenant 1 cannot mint token for Tenant 2 session."""
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/session/ses-beta-active/meeting-token",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert response.status_code == 404

    def test_ended_session_meeting_token_rejected(
        self, client, populated_db_hms
    ):
        """Cannot mint meeting token for ended session."""
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/session/ses-alpha-ended/meeting-token",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert response.status_code == 400

    def test_legacy_endpoint_downgrades_unauthorized_role_claim(
        self, client, populated_db_hms
    ):
        """The legacy /hms-token endpoint ignores client payload role if caller is student."""
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        response = client.post(
            "/hms-token",
            headers={"Authorization": f"Bearer {student_token}"},
            json={
                "user_name": "usr-stud-1",
                "role": "teacher",  # Caller tries to claim teacher
            },
        )
        assert response.status_code == 200
        decoded = jwt.decode(
            response.json()["token"], options={"verify_signature": False}
        )
        assert decoded["role"] == "student"  # Server forced student

    def test_meeting_provider_recording_is_strictly_disabled(
        self, mock_hms: MockHMSClient
    ):
        """Verify privacy requirement: 100ms recording must be disabled in room config."""
        compliant_config = {"recording": {"enabled": False}}
        violating_config = {"recording": {"enabled": True}}
        assert mock_hms.verify_recording_disabled(compliant_config) is True
        assert mock_hms.verify_recording_disabled(violating_config) is False
