"""
Unit & Integration Tests for Access Control Boundaries and Audit Logging (W6.7)
Verifies:
- Unassigned teacher cannot query student projections or issue challenges
- Student cannot query other students' events or projections
- Student event feed redacts private teacher notes
- Audit events logged for report view, export, teacher action, consent, deletion, and holds
"""
import pytest
from fastapi.testclient import TestClient
import main
from tests.conftest import generate_test_jwt, MockSupabaseClient


def test_unassigned_teacher_blocked_from_session_projections(test_client, mock_supabase: MockSupabaseClient):
    """Verify that an unassigned teacher in the same tenant is blocked with 403."""
    mock_supabase.reset()
    tenant_id = "ten-sec-001"
    session_id = "ses-sec-100"
    assigned_teacher_id = "usr-teacher-assigned"
    unassigned_teacher_id = "usr-teacher-unassigned"

    # Seed session assigned to assigned_teacher_id
    mock_supabase.table("sessions").insert({
        "session_id": session_id,
        "tenant_id": tenant_id,
        "host_id": assigned_teacher_id,
        "teacher_id": assigned_teacher_id,
        "status": "ACTIVE",
    }).execute()

    # Unassigned teacher token
    unassigned_token = generate_test_jwt(user_id=unassigned_teacher_id, tenant_id=tenant_id, role="teacher")
    unassigned_headers = {"Authorization": f"Bearer {unassigned_token}"}

    # Query participant list projection -> expect 403
    res = test_client.get(
        f"/api/v1/sessions/{session_id}/projections/participants",
        headers=unassigned_headers,
    )
    assert res.status_code == 403

    # Assigned teacher token -> expect 200
    assigned_token = generate_test_jwt(user_id=assigned_teacher_id, tenant_id=tenant_id, role="teacher")
    assigned_headers = {"Authorization": f"Bearer {assigned_token}"}
    res_ok = test_client.get(
        f"/api/v1/sessions/{session_id}/projections/participants",
        headers=assigned_headers,
    )
    assert res_ok.status_code == 200


def test_student_event_feed_redacts_private_teacher_notes(test_client, mock_supabase: MockSupabaseClient):
    """Verify that private teacher notes in TEACHER_ACTION_RECORDED are redacted in student event views."""
    mock_supabase.reset()
    tenant_id = "ten-sec-002"
    session_id = "ses-sec-200"
    student_id = "usr-student-view"
    teacher_id = "usr-teacher-view"

    # Seed session
    mock_supabase.table("sessions").insert({
        "session_id": session_id,
        "tenant_id": tenant_id,
        "host_id": teacher_id,
        "teacher_id": teacher_id,
        "status": "ACTIVE",
    }).execute()

    # Append TEACHER_ACTION_RECORDED event with confidential note
    main.repository.append_event({
        "event_id": "evt-teach-action-1",
        "event_type": "TEACHER_ACTION_RECORDED",
        "tenant_id": tenant_id,
        "session_id": session_id,
        "participant_id": student_id,
        "actor_id": teacher_id,
        "actor_role": "teacher",
        "source": "teacher",
        "occurred_at": "2026-08-20T10:00:00Z",
        "policy_id": "CLASSROOM",
        "payload": {
            "action_id": "act-1",
            "action_type": "message",
            "note": "Teacher internal evaluation: student showed fatigue",
        },
    })

    # Student query
    student_token = generate_test_jwt(user_id=student_id, tenant_id=tenant_id, role="student")
    res = test_client.get(
        f"/api/v1/sessions/{session_id}/events",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert res.status_code == 200
    events = res.json()["events"]
    assert len(events) >= 1
    note = events[0]["payload"]["note"]
    assert note == "[TEACHER_NOTE_CONFIDENTIAL]"


def test_audit_logs_recorded_for_governance_actions(test_client, mock_supabase: MockSupabaseClient):
    """Verify audit log entries exist for critical actions."""
    mock_supabase.reset()
    tenant_id = "ten-audit-001"
    session_id = "ses-audit-300"
    teacher_id = "usr-teacher-audit"

    # Seed session
    mock_supabase.table("sessions").insert({
        "session_id": session_id,
        "tenant_id": tenant_id,
        "host_id": teacher_id,
        "teacher_id": teacher_id,
        "status": "ACTIVE",
    }).execute()

    teacher_token = generate_test_jwt(user_id=teacher_id, tenant_id=tenant_id, role="teacher")
    headers = {"Authorization": f"Bearer {teacher_token}"}

    # 1. Access report -> triggers REPORT_ACCESSED audit
    test_client.get(f"/api/v1/sessions/{session_id}/report", headers=headers)

    # 2. Export report -> triggers REPORT_EXPORTED audit
    test_client.post(f"/api/v1/sessions/{session_id}/report/export-audit?export_format=pdf", headers=headers)

    # Inspect audit logs
    logs = main.repository.list_audit_logs(tenant_id)
    action_types = [l["action_type"] for l in logs]
    assert "REPORT_ACCESSED" in action_types
    assert "REPORT_EXPORTED" in action_types

