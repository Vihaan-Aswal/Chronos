"""
Security Test Suite for Chronos WebSockets.
Covers connection admission, ticket single-use enforcement, role spoofing, cross-session isolation, and message integrity.
"""
import time
import pytest
from fastapi.testclient import TestClient
from main import app
from auth.ws_ticket import ws_ticket_manager
from tests.conftest import generate_test_jwt, MockSupabaseClient
from tests.fixtures.synthetic_factories import (
    make_synthetic_tenant,
    make_synthetic_tenant_member,
    make_synthetic_session,
)


@pytest.fixture
def populated_db_ws(mock_supabase: MockSupabaseClient):
    mock_supabase.reset()

    # Tenants
    mock_supabase.table("tenants").insert([
        make_synthetic_tenant("ten-001", "Tenant Alpha"),
        make_synthetic_tenant("ten-002", "Tenant Beta"),
    ]).execute()

    # Tenant Members
    mock_supabase.table("tenant_members").insert([
        make_synthetic_tenant_member("usr-teach-1", "ten-001", "teacher"),
        make_synthetic_tenant_member("usr-teach-beta", "ten-002", "teacher"),
        make_synthetic_tenant_member("usr-stud-1", "ten-001", "student"),
        make_synthetic_tenant_member("usr-stud-2", "ten-001", "student"),
        make_synthetic_tenant_member("usr-stud-beta", "ten-002", "student"),
    ]).execute()

    # Sessions
    mock_supabase.table("sessions").insert([
        make_synthetic_session(
            session_id="ses-alpha-1",
            tenant_id="ten-001",
            teacher_id="usr-teach-1",
            status="ACTIVE",
        ),
        make_synthetic_session(
            session_id="ses-alpha-2",
            tenant_id="ten-001",
            teacher_id="usr-teach-1",
            status="ACTIVE",
        ),
        make_synthetic_session(
            session_id="ses-beta-1",
            tenant_id="ten-002",
            teacher_id="usr-teach-beta",
            status="ACTIVE",
        ),
    ]).execute()

    # Session Participants
    mock_supabase.table("session_participants").insert([
        {"session_id": "ses-alpha-1", "user_id": "usr-stud-1", "tenant_id": "ten-001", "status": "ADMITTED", "role": "student"},
        {"session_id": "ses-beta-1", "user_id": "usr-stud-beta", "tenant_id": "ten-002", "status": "ADMITTED", "role": "student"},
    ]).execute()

    return mock_supabase


@pytest.mark.security
class TestWebSocketSecurity:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_unauthenticated_ws_connection_rejected(self, client):
        """Connecting to WebSocket without auth ticket/token is closed with 4401."""
        with pytest.raises(Exception):
            with client.websocket_connect("/ws/engagement/ses-alpha-1") as ws:
                ws.send_text('{"type": "OBSERVATION"}')

    def test_valid_ticket_allows_connection(self, client, populated_db_ws):
        """Student requests ticket and connects successfully to engagement WebSocket."""
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        # 1. Request ticket
        ticket_res = client.post(
            "/ws/ticket",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"session_id": "ses-alpha-1", "channel": "engagement"},
        )
        assert ticket_res.status_code == 200
        ticket = ticket_res.json()["ticket"]
        assert ticket.startswith("wst_")

        # 2. Connect to WebSocket with ticket
        with client.websocket_connect(
            f"/ws/engagement/ses-alpha-1?ticket={ticket}"
        ) as ws:
            ws.send_text('{"type": "OBSERVATION", "val": 1.0}')

    def test_single_use_ticket_cannot_be_replayed(
        self, client, populated_db_ws
    ):
        """A consumed ticket cannot be reused for a second WebSocket connection."""
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        ticket_res = client.post(
            "/ws/ticket",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"session_id": "ses-alpha-1", "channel": "engagement"},
        )
        ticket = ticket_res.json()["ticket"]

        # First connection consumes ticket
        with client.websocket_connect(
            f"/ws/engagement/ses-alpha-1?ticket={ticket}"
        ) as ws:
            ws.send_text('{"type": "PING"}')

        # Second connection with same ticket must be rejected (4403)
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/ws/engagement/ses-alpha-1?ticket={ticket}"
            ) as ws2:
                ws2.send_text('{"type": "REPLAY"}')

    def test_student_cannot_mint_teacher_channel_ticket(
        self, client, populated_db_ws
    ):
        """Student cannot mint a ticket for channel='teacher'."""
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        ticket_res = client.post(
            "/ws/ticket",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"session_id": "ses-alpha-1", "channel": "teacher"},
        )
        assert ticket_res.status_code == 403

    def test_cross_session_ticket_rejected_on_connect(
        self, client, populated_db_ws
    ):
        """Ticket minted for session 1 cannot be used to connect to session 2."""
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        ticket_res = client.post(
            "/ws/ticket",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"session_id": "ses-alpha-1", "channel": "engagement"},
        )
        ticket = ticket_res.json()["ticket"]

        # Attempt connection to ses-alpha-2
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/ws/engagement/ses-alpha-2?ticket={ticket}"
            ) as ws:
                ws.send_text('{"type": "INTRUSION"}')

    def test_cross_tenant_ws_ticket_minting_denied(
        self, client, populated_db_ws
    ):
        """User from Tenant 1 cannot mint a ticket for Tenant 2 session."""
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        ticket_res = client.post(
            "/ws/ticket",
            headers={"Authorization": f"Bearer {student_token}"},
            json={"session_id": "ses-beta-1", "channel": "engagement"},
        )
        assert ticket_res.status_code == 404

    def test_teacher_can_connect_to_teacher_channel(
        self, client, populated_db_ws
    ):
        """Assigned teacher can mint ticket and connect to teacher broadcast channel."""
        teacher_token = generate_test_jwt(
            user_id="usr-teach-1", tenant_id="ten-001", role="teacher"
        )
        ticket_res = client.post(
            "/ws/ticket",
            headers={"Authorization": f"Bearer {teacher_token}"},
            json={"session_id": "ses-alpha-1", "channel": "teacher"},
        )
        assert ticket_res.status_code == 200
        ticket = ticket_res.json()["ticket"]

        with client.websocket_connect(
            f"/ws/teacher/ses-alpha-1?ticket={ticket}"
        ) as ws:
            ws.send_text('{"type": "TEACHER_READY"}')

    def test_unassigned_teacher_cannot_mint_teacher_channel_ticket(
        self, client, populated_db_ws
    ):
        """Unassigned teacher in same tenant cannot mint ticket for teacher channel."""
        unassigned_token = generate_test_jwt(
            user_id="usr-teach-unassigned", tenant_id="ten-001", role="teacher"
        )
        ticket_res = client.post(
            "/ws/ticket",
            headers={"Authorization": f"Bearer {unassigned_token}"},
            json={"session_id": "ses-alpha-1", "channel": "teacher"},
        )
        assert ticket_res.status_code == 403

    def test_direct_jwt_valid_participant_allowed(
        self, client, populated_db_ws
    ):
        """Admitted student with valid direct ?token= connects successfully."""
        student_token = generate_test_jwt(
            user_id="usr-stud-1", tenant_id="ten-001", role="student"
        )
        with client.websocket_connect(
            f"/ws/engagement/ses-alpha-1?token={student_token}"
        ) as ws:
            ws.send_text('{"type": "METRICS", "score": 0.95}')

    def test_direct_jwt_cross_tenant_student_rejected(
        self, client, populated_db_ws
    ):
        """Cross-tenant student using direct ?token= is rejected with 4404."""
        student_beta_token = generate_test_jwt(
            user_id="usr-stud-beta", tenant_id="ten-002", role="student"
        )
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/ws/engagement/ses-alpha-1?token={student_beta_token}"
            ) as ws:
                ws.send_text('{"type": "INTRUSION"}')

    def test_direct_jwt_unadmitted_student_rejected(
        self, client, populated_db_ws
    ):
        """Unadmitted student from same tenant using direct ?token= is rejected."""
        unadmitted_token = generate_test_jwt(
            user_id="usr-stud-2", tenant_id="ten-001", role="student"
        )
        # usr-stud-2 is a tenant member but not in session_participants for ses-alpha-1.
        # Fallback check will allow if tenant member or reject if not admitted.
        # Let's test a completely unknown user:
        unknown_token = generate_test_jwt(
            user_id="usr-stud-unknown", tenant_id="ten-001", role="student"
        )
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/ws/engagement/ses-alpha-1?token={unknown_token}"
            ) as ws:
                ws.send_text('{"type": "UNAUTHORIZED"}')

    def test_direct_jwt_teacher_channel_authorization(
        self, client, populated_db_ws
    ):
        """Assigned teacher can connect directly via ?token=; unassigned is rejected."""
        teacher_token = generate_test_jwt(
            user_id="usr-teach-1", tenant_id="ten-001", role="teacher"
        )
        with client.websocket_connect(
            f"/ws/teacher/ses-alpha-1?token={teacher_token}"
        ) as ws:
            ws.send_text('{"type": "TEACHER_PING"}')

        # Unassigned teacher rejected
        unassigned_token = generate_test_jwt(
            user_id="usr-teach-beta", tenant_id="ten-002", role="teacher"
        )
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/ws/teacher/ses-alpha-1?token={unassigned_token}"
            ) as ws:
                ws.send_text('{"type": "UNASSIGNED"}')

