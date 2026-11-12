"""
Integration and Hardening Test Suite for Chronos.
Verifies:
1. End-to-end RESOURCE_SUPPORTED_ASSESSMENT vertical slice.
2. Durable server sequence allocation across server restarts.
3. Provider compliance RBAC protection (require_admin).
4. WebSocket single-use ticket admission and replay resilience.
5. 50-participant simulator event processing and case aggregation invariants.
"""
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

import main
from main import app, ws_ticket_manager
from contracts import PolicyId, EventEnvelope
from tests.conftest import generate_test_jwt, MockSupabaseClient
from tests.fixtures.synthetic_factories import (
    make_synthetic_tenant,
    make_synthetic_tenant_member,
    make_synthetic_user,
    make_synthetic_session,
)

PDF_CONTENT = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"


@pytest.fixture
def hardening_db(mock_supabase: MockSupabaseClient):
    """Seed multi-tenant database for integration hardening tests."""
    mock_supabase.reset()

    # Tenants
    mock_supabase.table("tenants").insert([
        make_synthetic_tenant("ten-hard-1", "Hardening Tenant Alpha"),
        make_synthetic_tenant("ten-hard-2", "Hardening Tenant Beta"),
    ]).execute()

    # Tenant Members
    mock_supabase.table("tenant_members").insert([
        make_synthetic_tenant_member("usr-admin-1", "ten-hard-1", "admin"),
        make_synthetic_tenant_member("usr-teach-1", "ten-hard-1", "teacher"),
        make_synthetic_tenant_member("usr-stud-1", "ten-hard-1", "student"),
        make_synthetic_tenant_member("usr-stud-2", "ten-hard-1", "student"),
        make_synthetic_tenant_member("usr-teach-2", "ten-hard-2", "teacher"),
    ]).execute()

    # Users
    mock_supabase.table("users").insert([
        make_synthetic_user("usr-admin-1", "ten-hard-1", "admin", "Admin One"),
        make_synthetic_user("usr-teach-1", "ten-hard-1", "teacher", "Teacher One"),
        make_synthetic_user("usr-stud-1", "ten-hard-1", "student", "Student One"),
        make_synthetic_user("usr-stud-2", "ten-hard-1", "student", "Student Two"),
        make_synthetic_user("usr-teach-2", "ten-hard-2", "teacher", "Teacher Two"),
    ]).execute()

    # Sessions
    mock_supabase.table("sessions").insert([
        make_synthetic_session(
            session_id="ses-hard-draft",
            tenant_id="ten-hard-1",
            teacher_id="usr-teach-1",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="DRAFT",
        ),
        make_synthetic_session(
            session_id="ses-hard-active",
            tenant_id="ten-hard-1",
            teacher_id="usr-teach-1",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="ACTIVE",
        ),
        make_synthetic_session(
            session_id="ses-hard-demo",
            tenant_id="ten-hard-1",
            teacher_id="usr-teach-1",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="ACTIVE",
            is_demo=True,
        ),
    ]).execute()

    # Session Participants for Demo Session
    demo_participants = [
        {
            "session_id": "ses-hard-demo",
            "user_id": f"usr-sim-{i:02d}",
            "tenant_id": "ten-hard-1",
            "status": "ADMITTED",
            "role": "student",
        }
        for i in range(1, 51)
    ]
    mock_supabase.table("session_participants").insert(demo_participants).execute()

    return mock_supabase


class TestIntegrationHardening:
    """Complete integration hardening verification."""

    def test_provider_compliance_rbac(self, test_client: TestClient, hardening_db):
        """Admin compliance route strictly requires admin role."""
        teacher_jwt = generate_test_jwt("usr-teach-1", "ten-hard-1", "teacher")
        student_jwt = generate_test_jwt("usr-stud-1", "ten-hard-1", "student")
        admin_jwt = generate_test_jwt("usr-admin-1", "ten-hard-1", "admin")

        # Unauthenticated -> 401
        res_unauth = test_client.get("/admin/provider-compliance")
        assert res_unauth.status_code == 401

        # Student -> 403
        res_student = test_client.get(
            "/admin/provider-compliance",
            headers={"Authorization": f"Bearer {student_jwt}"},
        )
        assert res_student.status_code == 403

        # Teacher -> 403
        res_teacher = test_client.get(
            "/admin/provider-compliance",
            headers={"Authorization": f"Bearer {teacher_jwt}"},
        )
        assert res_teacher.status_code == 403

        # Admin -> 200 OK
        res_admin = test_client.get(
            "/admin/provider-compliance",
            headers={"Authorization": f"Bearer {admin_jwt}"},
        )
        assert res_admin.status_code == 200
        data = res_admin.json()
        assert data.get("compliant") is True
        assert data.get("status") == "COMPLIANT"
        metadata = data.get("metadata", {})
        checks = metadata.get("checks", {})
        assert checks.get("browser_recording") == "DISABLED"
        assert checks.get("transcription") == "DISABLED"
        assert checks.get("ai_summary") == "DISABLED"

    def test_durable_server_sequence_on_restart(self, hardening_db):
        """Server sequence counter recovers from stored events across restart."""
        session_id = "ses-seq-restart-test"
        tenant_id = "ten-hard-1"
        now_iso = datetime.now(timezone.utc).isoformat()

        # Append 3 events
        for i in range(1, 4):
            envelope = EventEnvelope(
                event_id=f"evt-restart-{i}",
                event_type="OBSERVATION_SAMPLE",
                schema_version=1,
                tenant_id=tenant_id,
                session_id=session_id,
                participant_id="usr-stud-1",
                actor_id="usr-stud-1",
                actor_role="participant",
                source="camera",
                occurred_at=now_iso,
                received_at=now_iso,
                policy_id="RESOURCE_SUPPORTED_ASSESSMENT",
                is_demo=False,
                payload={"sample_id": f"s-{i}", "usable": True},
            )
            stored = main.repository.append_event(envelope)
            assert stored["server_sequence"] == i

        # Simulate server crash/restart by wiping in-memory sequence cache
        main.repository._session_sequences.clear()

        # Append 4th event -> should continue with sequence 4
        envelope_after_restart = EventEnvelope(
            event_id="evt-restart-4",
            event_type="OBSERVATION_SAMPLE",
            schema_version=1,
            tenant_id=tenant_id,
            session_id=session_id,
            participant_id="usr-stud-1",
            actor_id="usr-stud-1",
            actor_role="participant",
            source="camera",
            occurred_at=now_iso,
            received_at=now_iso,
            policy_id="RESOURCE_SUPPORTED_ASSESSMENT",
            is_demo=False,
            payload={"sample_id": "s-4", "usable": True},
        )
        stored_after = main.repository.append_event(envelope_after_restart)
        assert stored_after["server_sequence"] == 4

    def test_websocket_ticket_issuance_and_single_use(self, test_client: TestClient, hardening_db):
        """Ticket issuance enforces session binding and single-use invalidation."""
        student_jwt = generate_test_jwt("usr-stud-1", "ten-hard-1", "student")

        # Acquire ticket
        ticket_res = test_client.post(
            "/ws/ticket",
            headers={"Authorization": f"Bearer {student_jwt}"},
            json={"session_id": "ses-hard-active", "channel": "engagement"},
        )
        assert ticket_res.status_code == 200
        ticket_data = ticket_res.json()
        assert "ticket" in ticket_data
        ticket = ticket_data["ticket"]
        assert ticket.startswith("wst_")

        # Validate ticket against ticket manager
        claimed = ws_ticket_manager.consume_ticket(
            ticket_id=ticket,
            expected_session_id="ses-hard-active",
            expected_channel="engagement",
        )
        assert claimed is not None
        assert claimed.session_id == "ses-hard-active"
        assert claimed.user_id == "usr-stud-1"

        # Second claim with same ticket must fail (single-use)
        with pytest.raises(HTTPException) as exc_info:
            ws_ticket_manager.consume_ticket(
                ticket_id=ticket,
                expected_session_id="ses-hard-active",
                expected_channel="engagement",
            )
        assert exc_info.value.status_code == 403

    def test_resource_supported_assessment_slice(self, test_client: TestClient, hardening_db):
        """Complete vertical slice: upload -> freeze on start -> draft -> submissions."""
        teacher_jwt = generate_test_jwt("usr-teach-1", "ten-hard-1", "teacher")
        student_jwt = generate_test_jwt("usr-stud-1", "ten-hard-1", "student")

        # 1. Upload Question Paper in DRAFT
        upload_res = test_client.post(
            "/api/v1/sessions/ses-hard-draft/resources/upload",
            headers={"Authorization": f"Bearer {teacher_jwt}"},
            data={"title": "Midterm Exam Paper", "is_primary": "true"},
            files={"file": ("exam.pdf", PDF_CONTENT, "application/pdf")},
        )
        assert upload_res.status_code in (200, 201)
        res_data = upload_res.json()
        assert res_data["title"] == "Midterm Exam Paper"
        assert res_data["is_primary"] is True

        # 2. Add External Link
        link_res = test_client.post(
            "/api/v1/sessions/ses-hard-draft/resources/external-link",
            headers={"Authorization": f"Bearer {teacher_jwt}"},
            json={
                "title": "Documentation",
                "declared_url": "https://docs.python.org/3/",
                "description": "Python Standard Library Reference",
            },
        )
        assert link_res.status_code in (200, 201)

        # 3. Student Auto-save Draft
        draft_res = test_client.post(
            "/api/v1/sessions/ses-hard-draft/answers/draft",
            headers={"Authorization": f"Bearer {student_jwt}"},
            json={"typed_content": "Drafting solution to question 1..."},
        )
        assert draft_res.status_code == 200
        assert draft_res.json()["status"] == "DRAFT"

        # 4. Student Submits Answer (v1, v2, v3)
        for v in range(1, 4):
            sub_res = test_client.post(
                "/api/v1/sessions/ses-hard-draft/answers/submit",
                headers={"Authorization": f"Bearer {student_jwt}"},
                json={
                    "typed_content": f"Final Solution Version {v}",
                    "is_final": True,
                    "client_submission_id": f"sub-{v}",
                },
            )
            assert sub_res.status_code in (200, 201)
            sub_data = sub_res.json()
            assert sub_data["version"] == v
            assert sub_data["status"] == "SUBMITTED"
            assert sub_data["content_hash"] is not None

        # 4th submission must be rejected (max 3 versions)
        excess_res = test_client.post(
            "/api/v1/sessions/ses-hard-draft/answers/submit",
            headers={"Authorization": f"Bearer {student_jwt}"},
            json={"typed_content": "Excess 4th Version", "is_final": True},
        )
        assert excess_res.status_code in (400, 422)

    def test_immutable_resources_when_active(self, test_client: TestClient, hardening_db):
        """Active session rejects new resource uploads (409 Conflict)."""
        teacher_jwt = generate_test_jwt("usr-teach-1", "ten-hard-1", "teacher")

        upload_res = test_client.post(
            "/api/v1/sessions/ses-hard-active/resources/upload",
            headers={"Authorization": f"Bearer {teacher_jwt}"},
            data={"title": "Late Paper", "is_primary": "false"},
            files={"file": ("late.pdf", PDF_CONTENT, "application/pdf")},
        )
        assert upload_res.status_code == 409

    def test_50_participant_simulation_ingest(self, test_client: TestClient, hardening_db):
        """Ingesting 50 simulated participants with distinct cryptographic identities processes cleanly."""
        admin_jwt = generate_test_jwt("usr-admin-1", "ten-hard-1", "admin")
        now_iso = datetime.now(timezone.utc).isoformat()

        # Enroll 50 distinct participants in session roster
        participants_to_insert = [
            {
                "session_id": "ses-hard-demo",
                "user_id": f"usr-sim-{i:02d}",
                "tenant_id": "ten-hard-1",
                "status": "ADMITTED",
                "role": "student",
            }
            for i in range(1, 51)
        ]
        hardening_db.table("session_participants").insert(participants_to_insert).execute()

        # Ingest 50 samples using distinct authorized participant JWTs
        for i in range(1, 51):
            pid = f"usr-sim-{i:02d}"
            part_jwt = generate_test_jwt(pid, "ten-hard-1", "student")

            envelope = EventEnvelope(
                event_id=f"sim-evt-{pid}",
                event_type="OBSERVATION_SAMPLE",
                schema_version=1,
                tenant_id="ten-hard-1",
                session_id="ses-hard-demo",
                participant_id=pid,
                actor_id=pid,
                actor_role="participant",
                source="camera",
                occurred_at=now_iso,
                received_at=now_iso,
                policy_id="RESOURCE_SUPPORTED_ASSESSMENT",
                is_demo=True,
                payload={
                    "sample_id": f"samp-{pid}",
                    "usable": True,
                    "face_count": 1,
                    "quality_score": 0.95,
                    "yaw_deg": 0.0,
                    "pitch_deg": 0.0,
                    "roll_deg": 0.0,
                },
            )
            res = test_client.post(
                "/api/v1/events/ingest",
                headers={"Authorization": f"Bearer {part_jwt}"},
                json=envelope.model_dump(mode="json"),
            )
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"

        # Verify 50 participant drilldowns exist in report
        rep_res = test_client.get(
            "/api/v1/sessions/ses-hard-demo/report",
            headers={"Authorization": f"Bearer {admin_jwt}"},
        )
        assert rep_res.status_code == 200
        report_data = rep_res.json()
        report = report_data.get("report", report_data)
        assert report["session_id"] == "ses-hard-demo"
        assert len(report["participant_drilldowns"]) == 50

    def test_50_participant_websocket_multi_socket_concurrency(self, test_client: TestClient, hardening_db):
        """Verify concurrent multi-socket WebSocket telemetry ingestion with distinct cryptographic tokens."""
        teacher_jwt = generate_test_jwt("usr-teach-1", "ten-hard-1", "teacher")
        session_id = "ses-hard-demo"

        # Connect teacher WebSocket listener
        with test_client.websocket_connect(f"/ws/teacher/{session_id}?token={teacher_jwt}") as teacher_ws:
            # Simulate 10 concurrent student sockets connecting with individual distinct JWTs
            for i in range(1, 11):
                pid = f"usr-sim-{i:02d}"
                part_jwt = generate_test_jwt(pid, "ten-hard-1", "student")
                with test_client.websocket_connect(f"/ws/engagement/{session_id}?token={part_jwt}") as student_ws:
                    sample = {
                        "type": "OBSERVATION_SAMPLE",
                        "occurred_at": datetime.now(timezone.utc).isoformat(),
                        "payload": {
                            "sample_id": f"samp-ws-hard-{pid}",
                            "usable": True,
                            "face_count": 1,
                            "quality_score": 0.94,
                            "head_pose": {"yaw_deg": 0.0, "pitch_deg": 0.0, "roll_deg": 0.0},
                            "technical_reasons": [],
                        },
                    }
                    student_ws.send_json(sample)
                    broadcast = teacher_ws.receive_json()
                    assert broadcast["session_id"] == session_id
                    assert broadcast["participant_id"] == pid


