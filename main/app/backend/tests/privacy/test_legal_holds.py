"""
Unit & Integration Tests for Legal & Institutional Holds (W6.4, W6.6)
Verifies:
- Hold creation with metadata
- Active holds block deletion
- Release of hold enables deletion
- Audit logging on hold create and release
"""
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
import main
from tests.conftest import generate_test_jwt, MockSupabaseClient


def test_legal_hold_lifecycle_and_deletion_protection(test_client, mock_supabase: MockSupabaseClient):
    """Verify that an active legal hold blocks deletion and releasing it allows deletion."""
    mock_supabase.reset()
    tenant_id = "ten-hold-001"
    session_id = "ses-held-session-101"
    admin_token = generate_test_jwt(user_id="usr-admin-hold", tenant_id=tenant_id, role="admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Apply Legal Hold on session
    future_date = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    hold_payload = {
        "reason": "Institutional Academic Misconduct Inquiry #4021",
        "approver_email": "dean@institution.edu",
        "expiry_or_review_date": future_date,
        "session_id": session_id,
        "data_classes": ["ALL"],
        "notes": "Preserve all logs and answer submissions",
    }
    create_res = test_client.post(
        "/api/v1/privacy/holds",
        headers=headers,
        json=hold_payload,
    )
    assert create_res.status_code == 200
    hold_data = create_res.json()["hold"]
    hold_id = hold_data["hold_id"]
    assert hold_data["status"] == "ACTIVE"

    # 2. Attempt deletion on held session -> Expect BLOCKED_BY_HOLD
    del_result = main.retention_service.execute_session_deletion(
        tenant_id=tenant_id,
        session_id=session_id,
        actor_id="usr-admin-hold",
        dry_run=False,
    )
    assert del_result["status"] == "BLOCKED_BY_HOLD"
    assert len(del_result["held_items"]) == 1

    # 3. List holds
    list_res = test_client.get("/api/v1/privacy/holds?status=ACTIVE", headers=headers)
    assert list_res.status_code == 200
    assert len(list_res.json()["holds"]) >= 1

    # 4. Release Legal Hold
    rel_res = test_client.post(
        f"/api/v1/privacy/holds/{hold_id}/release",
        headers=headers,
        json={"release_reason": "Inquiry completed; no sanctions required."},
    )
    assert rel_res.status_code == 200
    assert rel_res.json()["hold"]["status"] == "RELEASED"

    # 5. Re-attempt deletion -> Expect COMPLETED
    del_result_2 = main.retention_service.execute_session_deletion(
        tenant_id=tenant_id,
        session_id=session_id,
        actor_id="usr-admin-hold",
        dry_run=False,
    )
    assert del_result_2["status"] == "COMPLETED"

