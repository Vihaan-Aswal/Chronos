"""
Security tests for Sliding-Window Rate Limiter.
Validates flood protection on sensitive endpoints (tickets, liveness triggers, token minting).
"""
import pytest
from fastapi.testclient import TestClient
from main import app
from auth.rate_limiter import limiter
from tests.conftest import generate_test_jwt, MockSupabaseClient
from tests.fixtures.synthetic_factories import (
    make_synthetic_tenant,
    make_synthetic_tenant_member,
    make_synthetic_session,
)


@pytest.fixture
def populated_db_rl(mock_supabase: MockSupabaseClient):
    mock_supabase.reset()
    limiter.reset()

    # Tenants
    mock_supabase.table("tenants").insert([
        make_synthetic_tenant("ten-001", "Tenant Alpha"),
    ]).execute()

    # Tenant Members
    mock_supabase.table("tenant_members").insert([
        make_synthetic_tenant_member("usr-teach-1", "ten-001", "teacher"),
    ]).execute()

    # Sessions
    mock_supabase.table("sessions").insert([
        make_synthetic_session(
            session_id="ses-alpha-1",
            tenant_id="ten-001",
            teacher_id="usr-teach-1",
            status="ACTIVE",
        ),
    ]).execute()

    return mock_supabase


@pytest.mark.security
class TestRateLimitingSecurity:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_liveness_rate_limiter_enforces_threshold(
        self, client, populated_db_rl
    ):
        """Triggering liveness challenges beyond the rate limit receives 429 Too Many Requests."""
        teacher_token = generate_test_jwt(
            user_id="usr-teach-1", tenant_id="ten-001", role="teacher"
        )
        headers = {"Authorization": f"Bearer {teacher_token}"}

        status_codes = []
        # Limit is 10 requests / minute
        for i in range(15):
            res = client.post(
                "/liveness/trigger",
                headers=headers,
                json={"session_id": "ses-alpha-1"},
            )
            status_codes.append(res.status_code)

        assert 200 in status_codes
        assert 429 in status_codes

        # Find first 429 response and verify headers
        res_429 = client.post(
            "/liveness/trigger",
            headers=headers,
            json={"session_id": "ses-alpha-1"},
        )
        assert res_429.status_code == 429
        assert "Retry-After" in res_429.headers
        assert int(res_429.headers["Retry-After"]) > 0
        assert "X-RateLimit-Limit" in res_429.headers
        assert res_429.headers["X-RateLimit-Remaining"] == "0"

    def test_ticket_rate_limiter_enforcement(
        self, client, populated_db_rl
    ):
        """Rapid WS ticket requests trigger 429 rate limit."""
        teacher_token = generate_test_jwt(
            user_id="usr-teach-1", tenant_id="ten-001", role="teacher"
        )
        headers = {"Authorization": f"Bearer {teacher_token}"}

        status_codes = []
        # Limit is 20 requests / minute
        for i in range(25):
            res = client.post(
                "/ws/ticket",
                headers=headers,
                json={"session_id": "ses-alpha-1", "channel": "teacher"},
            )
            status_codes.append(res.status_code)

        assert 200 in status_codes
        assert 429 in status_codes
