"""
Unit & Integration Tests for Meeting Provider Compliance (W6.8)
Verifies:
- 100ms room & template configuration disablement of recording, transcription, and AI summary
- /admin/provider-compliance endpoint
- Detection of non-compliant configurations
"""
import pytest
from fastapi.testclient import TestClient
from main import app
from auth.hms_verification import HMSComplianceVerifier
from tests.conftest import generate_test_jwt


def test_provider_compliance_endpoint(test_client):
    """Verify provider compliance endpoint returns COMPLIANT in clean configuration."""
    admin_token = generate_test_jwt(user_id="usr-admin", tenant_id="ten-001", role="admin")
    res = test_client.get("/admin/provider-compliance", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLIANT"
    assert data["compliant"] is True
    assert len(data["violations"]) == 0


def test_provider_compliance_verifier_catches_violations():
    """Verify HMSComplianceVerifier flags recording or transcription if enabled."""
    verifier = HMSComplianceVerifier()

    violating_config = {
        "recording": {
            "browser": {"enabled": True},
            "sfu": {"enabled": False},
        },
        "destinations": {
            "storage": {"s3_bucket": "chronos-video-storage-violation"},
        },
        "transcription": {"enabled": True},
        "ai": {
            "summary": {"enabled": True},
        },
    }

    is_compliant, violations, metadata = verifier.verify_room_and_template_compliance(custom_config=violating_config)
    assert is_compliant is False
    assert len(violations) >= 3
    v_str = " ".join(violations)
    assert "Browser/Composite recording is ENABLED" in v_str
    assert "Cloud storage destination is configured" in v_str
    assert "Live transcription is ENABLED" in v_str
    assert "AI summary is ENABLED" in v_str


def test_start_session_fails_closed_on_provider_violation(test_client, monkeypatch):
    """Verify session start fails closed with HTTP 412 if provider template check fails."""
    import main
    teacher_token = generate_test_jwt(user_id="usr-teacher-hms", tenant_id="ten-001", role="teacher")
    
    # Create a draft session
    create_res = test_client.post(
        "/session/create",
        headers={"Authorization": f"Bearer {teacher_token}"},
        json={
            "title": "Provider Privacy Test Session",
            "policy_id": "CLASSROOM",
            "is_demo": False,
        },
    )
    assert create_res.status_code == 200
    session_id = create_res.json()["session"]["session_id"]

    # Mock hms_verifier to report non-compliant
    def mock_verify(*args, **kwargs):
        return False, ["Violation: Cloud storage destination is configured"], {"compliant": False}

    monkeypatch.setattr(main.hms_verifier, "verify_room_and_template_compliance", mock_verify)

    # Attempt start
    start_res = test_client.post(
        f"/session/{session_id}/start",
        headers={"Authorization": f"Bearer {teacher_token}"},
    )
    assert start_res.status_code == 412
    assert "Meeting provider privacy check failed" in start_res.json()["detail"]

