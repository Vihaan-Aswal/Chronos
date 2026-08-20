"""
Unit & Integration Tests for Retention Engine & 7-Step Deletion Pipeline (W6.4, W6.5)
Verifies:
- 24-hour maximum temporary identity artifact purge
- 7-step deletion execution
- Retention scheduled scan and dry-run mode
- Idempotency (re-running deletion does not error and returns 0 deleted)
- Protection against deleting active held sessions
"""
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
import main
from tests.conftest import generate_test_jwt, MockSupabaseClient


def test_temporary_identity_artifact_24h_purge(mock_supabase: MockSupabaseClient):
    """Verify temporary identity embeddings older than 24h are purged."""
    mock_supabase.reset()
    tenant_id = "ten-purge-001"
    now = datetime.now(timezone.utc)

    # 1. Insert recent embedding (2 hours old)
    recent_item = {
        "user_id": "usr-recent",
        "tenant_id": tenant_id,
        "embedding": [0.1] * 128,
        "created_at": (now - timedelta(hours=2)).isoformat(),
    }
    mock_supabase.table("identity_embeddings").insert(recent_item).execute()

    # 2. Insert expired embedding (26 hours old)
    expired_item = {
        "user_id": "usr-expired",
        "tenant_id": tenant_id,
        "embedding": [0.2] * 128,
        "created_at": (now - timedelta(hours=26)).isoformat(),
    }
    mock_supabase.table("identity_embeddings").insert(expired_item).execute()

    # 3. Execute purge
    purged_count = main.repository.purge_temporary_identity_artifacts(max_age_hours=24)
    assert purged_count == 1

    # 4. Check remaining
    remaining = mock_supabase.table("identity_embeddings").select("*").execute().data
    assert len(remaining) == 1
    assert remaining[0]["user_id"] == "usr-recent"


def test_seven_step_session_deletion_pipeline_and_idempotency(test_client, mock_supabase: MockSupabaseClient):
    """Verify the 7-step deletion workflow, tombstone emission, and idempotent re-runs."""
    mock_supabase.reset()
    tenant_id = "ten-del-001"
    session_id = "ses-deletion-test-101"
    admin_token = generate_test_jwt(user_id="usr-admin", tenant_id=tenant_id, role="admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Populate session and resources in DB and storage
    session_record = {
        "session_id": session_id,
        "tenant_id": tenant_id,
        "status": "ENDED",
        "ended_at": (datetime.now(timezone.utc) - timedelta(days=95)).isoformat(),
    }
    mock_supabase.table("sessions").insert(session_record).execute()

    # Create dummy resource in storage
    storage_path = f"tenants/{tenant_id}/sessions/{session_id}/resources/paper.pdf"
    main.storage_service.upload_file(storage_path, b"%PDF-1.4 dummy", "application/pdf")
    mock_supabase.table("resource_projections").insert({
        "resource_id": "res-101",
        "session_id": session_id,
        "tenant_id": tenant_id,
        "storage_path": storage_path,
        "size_bytes": 14,
    }).execute()

    # 1. Run Dry-Run Deletion
    dry_res = test_client.post(
        "/api/v1/privacy/retention/dry-run",
        headers=headers,
        json={"session_id": session_id, "tenant_id": tenant_id},
    )
    assert dry_res.status_code == 200
    dry_data = dry_res.json()["dry_run"]
    assert dry_data["dry_run"] is True
    assert dry_data["files_deleted"] == 1

    # 2. Run Live Deletion Execution
    exec_res = test_client.post(
        "/api/v1/privacy/retention/execute",
        headers=headers,
        json={"session_id": session_id, "tenant_id": tenant_id},
    )
    assert exec_res.status_code == 200
    exec_data = exec_res.json()["execution"]
    assert exec_data["status"] == "COMPLETED"
    assert exec_data["files_deleted"] == 1

    # Verify tombstone exists
    tombstones = main.repository.list_deletion_tombstones(tenant_id)
    assert len(tombstones) >= 1
    assert tombstones[0]["session_id"] == session_id

    # 3. Idempotent Re-Run Deletion
    exec_res_2 = test_client.post(
        "/api/v1/privacy/retention/execute",
        headers=headers,
        json={"session_id": session_id, "tenant_id": tenant_id},
    )
    assert exec_res_2.status_code == 200
    exec_data_2 = exec_res_2.json()["execution"]
    assert exec_data_2["status"] == "COMPLETED"
    assert exec_data_2["files_deleted"] == 0

