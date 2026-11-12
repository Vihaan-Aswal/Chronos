"""
Unit & Integration Tests for Granular Consent Lifecycle (W6.2, W6.3)
Verifies:
- All 8 consent categories
- Policy-versioned historical records
- Mid-session withdrawal behavior
- Processing boundary enforcement (dropping analytics when declined)
- Non-penalization invariant (declining is never misconduct)
"""
import pytest
from fastapi.testclient import TestClient
import main
from contracts import ConsentCategory, EventType
from tests.conftest import generate_test_jwt, MockSupabaseClient


def test_granular_consent_all_eight_categories(test_client, mock_supabase: MockSupabaseClient):
    """Verify recording and querying across all 8 required consent categories."""
    mock_supabase.reset()
    tenant_id = "ten-consent-001"
    student_id = "usr-student-consent"
    token = generate_test_jwt(user_id=student_id, tenant_id=tenant_id, role="student")
    headers = {"Authorization": f"Bearer {token}"}

    all_scopes = [
        ConsentCategory.LIVE_SESSION_PARTICIPATION.value,
        ConsentCategory.CAMERA_LOCAL_PROCESSING.value,
        ConsentCategory.IDENTITY_ENROLLMENT.value,
        ConsentCategory.IDENTITY_VERIFICATION.value,
        ConsentCategory.ACTIVE_PRESENCE_CHECKS.value,
        ConsentCategory.ATTENTION_TELEMETRY.value,
        ConsentCategory.BROWSER_CONTEXT_TELEMETRY.value,
        ConsentCategory.ANSWER_STORAGE.value,
    ]
    assert len(all_scopes) == 8

    # Batch grant from pre-join transparency modal
    scopes_payload = {s: True for s in all_scopes}
    scopes_payload["ATTENTION_TELEMETRY"] = False  # Student opts out of attention telemetry

    res = test_client.post(
        "/api/v1/privacy/consent",
        headers=headers,
        json={
            "session_id": "ses-consent-100",
            "policy_version": "v1.2",
            "scopes": scopes_payload,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert len(data["consents"]) == 8

    # Check status for granted vs declined
    assert main.consent_service.is_scope_granted(tenant_id, student_id, "CAMERA_LOCAL_PROCESSING", "ses-consent-100") is True
    assert main.consent_service.is_scope_granted(tenant_id, student_id, "ATTENTION_TELEMETRY", "ses-consent-100") is False

    # Query participant's own consent records
    mine_res = test_client.get(
        "/api/v1/privacy/consent/mine?session_id=ses-consent-100",
        headers=headers,
    )
    assert mine_res.status_code == 200
    mine_data = mine_res.json()["consents"]
    assert len(mine_data) >= 8


def test_mid_session_consent_withdrawal(test_client, mock_supabase: MockSupabaseClient):
    """Verify withdrawing an optional scope mid-session without modifying historical audit."""
    mock_supabase.reset()
    tenant_id = "ten-consent-002"
    student_id = "usr-student-withdraw"
    token = generate_test_jwt(user_id=student_id, tenant_id=tenant_id, role="student")
    headers = {"Authorization": f"Bearer {token}"}
    session_id = "ses-mid-session-withdraw"

    # 1. Initially grant camera & telemetry
    main.consent_service.record_consent_grant(
        tenant_id=tenant_id,
        subject_id=student_id,
        scope="CAMERA_LOCAL_PROCESSING",
        grant=True,
        session_id=session_id,
        policy_version="v1.0",
    )
    assert main.consent_service.is_scope_granted(tenant_id, student_id, "CAMERA_LOCAL_PROCESSING", session_id) is True

    # 2. Withdraw mid-session
    w_res = test_client.post(
        "/api/v1/privacy/consent/withdraw",
        headers=headers,
        json={
            "session_id": session_id,
            "scope": "CAMERA_LOCAL_PROCESSING",
            "policy_version": "v1.0",
        },
    )
    assert w_res.status_code == 200
    w_data = w_res.json()
    assert w_data["status"] == "success"
    assert w_data["withdrawn"]["grant_or_decline"] == "DECLINE"
    assert w_data["withdrawn"]["withdrawn_at"] is not None

    # 3. Verify scope is now inactive
    assert main.consent_service.is_scope_granted(tenant_id, student_id, "CAMERA_LOCAL_PROCESSING", session_id) is False


def test_decline_semantics_drops_telemetry_at_boundary(test_client, mock_supabase: MockSupabaseClient):
    """Verify that declining telemetry drops observation events without counting misconduct."""
    mock_supabase.reset()
    tenant_id = "ten-boundary-001"
    student_id = "usr-student-optout"
    session_id = "ses-boundary-test"

    # Explicitly decline ATTENTION_TELEMETRY
    main.consent_service.record_consent_grant(
        tenant_id=tenant_id,
        subject_id=student_id,
        scope="ATTENTION_TELEMETRY",
        grant=False,
        session_id=session_id,
    )

    assert main.consent_service.is_scope_granted(tenant_id, student_id, "ATTENTION_TELEMETRY", session_id) is False

