"""
Authorization and Audit Logging Tests for Report Endpoints
Workstream W8: Timeline-Led Reports and Exports
Specification: HACKATHON_PRD.md, LOGIC_AND_EVENT_SPEC.md
"""
import pytest
from tests.conftest import generate_test_jwt, MockSupabaseClient


def test_report_access_requires_assigned_teacher(test_client, mock_supabase: MockSupabaseClient):
    """Verify only assigned teacher or tenant admin can access session reports."""
    mock_supabase.reset()
    tenant_id = "ten-auth-1"
    sess_id = "sess-auth-rep-1"
    assigned_teacher_id = "teach-assigned-1"
    unassigned_teacher_id = "teach-unassigned-1"

    # Seed session assigned to assigned_teacher_id
    mock_supabase.table("sessions").insert({
        "session_id": sess_id,
        "tenant_id": tenant_id,
        "host_id": assigned_teacher_id,
        "teacher_id": assigned_teacher_id,
        "title": "Auth Protected Report",
        "policy_id": "CLASSROOM",
        "status": "ENDED",
    }).execute()

    # 1. Anonymous request -> 401
    res = test_client.get(f"/api/v1/sessions/{sess_id}/report")
    assert res.status_code == 401

    # 2. Unassigned teacher -> 403
    unassigned_token = generate_test_jwt(
        user_id=unassigned_teacher_id,
        tenant_id=tenant_id,
        role="teacher",
    )
    res = test_client.get(
        f"/api/v1/sessions/{sess_id}/report",
        headers={"Authorization": f"Bearer {unassigned_token}"},
    )
    assert res.status_code == 403

    # 3. Assigned teacher -> 200 and audit log recorded
    assigned_token = generate_test_jwt(
        user_id=assigned_teacher_id,
        tenant_id=tenant_id,
        role="teacher",
    )
    res = test_client.get(
        f"/api/v1/sessions/{sess_id}/report",
        headers={"Authorization": f"Bearer {assigned_token}"},
    )
    assert res.status_code == 200
    report_data = res.json()["report"]
    assert report_data["session_id"] == sess_id

    # 4. Record export audit -> 200
    export_res = test_client.post(
        f"/api/v1/sessions/{sess_id}/report/export-audit?export_format=pdf",
        headers={"Authorization": f"Bearer {assigned_token}"},
    )
    assert export_res.status_code == 200
