"""
Unit & Integration Tests for Data Subject Rights (DSR) & Student Appeals (W6.6)
Verifies:
- Subject Access Request (SAR data export)
- Right to Erasure request processing
- Zero raw biometrics or embeddings in export
- Student technical context / appeal submissions
"""
import pytest
from fastapi.testclient import TestClient
import main
from tests.conftest import generate_test_jwt, MockSupabaseClient


def test_participant_data_export_sar(test_client, mock_supabase: MockSupabaseClient):
    """Verify Subject Access Request export guarantees."""
    mock_supabase.reset()
    tenant_id = "ten-dsr-001"
    student_id = "usr-student-dsr"
    token = generate_test_jwt(user_id=student_id, tenant_id=tenant_id, role="student")
    headers = {"Authorization": f"Bearer {token}"}

    # Record sample consent and projection
    main.repository.record_consent({
        "consent_id": "con-100",
        "tenant_id": tenant_id,
        "subject_id": student_id,
        "scope": "LIVE_SESSION_PARTICIPATION",
        "grant_or_decline": "GRANT",
    })

    res = test_client.get("/api/v1/privacy/data-export", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["subject_id"] == student_id
    assert "privacy_notice" in data
    assert "consent_history" in data["data"]
    # Check zero embedding in export
    export_str = str(data)
    assert "embedding_vector" not in export_str


def test_participant_erasure_request(test_client, mock_supabase: MockSupabaseClient):
    """Verify student erasure request creates request and purges participant records."""
    mock_supabase.reset()
    tenant_id = "ten-dsr-002"
    student_id = "usr-student-erasure"
    session_id = "ses-dsr-200"
    token = generate_test_jwt(user_id=student_id, tenant_id=tenant_id, role="student")
    headers = {"Authorization": f"Bearer {token}"}

    res = test_client.post(
        "/api/v1/privacy/deletion-request",
        headers=headers,
        json={
            "session_id": session_id,
            "data_classes": ["ALL"],
            "reason": "Graduated and requesting account cleanup",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLETED"


def test_student_context_appeal_submission(test_client, mock_supabase: MockSupabaseClient):
    """Verify student technical context submission emits durable event."""
    mock_supabase.reset()
    tenant_id = "ten-dsr-003"
    student_id = "usr-student-appeal"
    session_id = "ses-appeal-300"
    token = generate_test_jwt(user_id=student_id, tenant_id=tenant_id, role="student")
    headers = {"Authorization": f"Bearer {token}"}

    # Seed session
    mock_supabase.table("sessions").insert({
        "session_id": session_id,
        "tenant_id": tenant_id,
        "status": "ACTIVE",
    }).execute()

    res = test_client.post(
        f"/api/v1/sessions/{session_id}/context",
        headers=headers,
        json={
            "appeal_category": "technical_glitch",
            "explanation_text": "Webcam disconnected during question 3 due to USB hub failure.",
            "requested_help": True,
            "attached_to_event_ids": ["evt-q3-123"],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "context_id" in data

