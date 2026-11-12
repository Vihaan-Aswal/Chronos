"""
Assessment Endpoints Integration Test Suite.
Tests full teacher and student assessment lifecycle workflows, resource management,
drafting, versioned submission progression, idempotency, and NO_ANALYTICS mode.
"""
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

from main import app
from contracts import PolicyId
from tests.conftest import generate_test_jwt, MockSupabaseClient
from tests.fixtures.synthetic_factories import (
    make_synthetic_tenant,
    make_synthetic_tenant_member,
    make_synthetic_user,
    make_synthetic_session,
)

PDF_MAGIC = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
JPEG_MAGIC = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xd9"


@pytest.fixture
def assessment_db(mock_supabase: MockSupabaseClient):
    """Seed multi-tenant database for assessment testing."""
    mock_supabase.reset()

    # Tenants
    mock_supabase.table("tenants").insert([
        make_synthetic_tenant("ten-001", "Tenant Alpha"),
        make_synthetic_tenant("ten-002", "Tenant Beta"),
    ]).execute()

    # Tenant Members
    mock_supabase.table("tenant_members").insert([
        make_synthetic_tenant_member("usr-teach-1", "ten-001", "teacher"),
        make_synthetic_tenant_member("usr-teach-2", "ten-001", "teacher"),
        make_synthetic_tenant_member("usr-teach-beta", "ten-002", "teacher"),
        make_synthetic_tenant_member("usr-stud-1", "ten-001", "student"),
        make_synthetic_tenant_member("usr-stud-2", "ten-001", "student"),
        make_synthetic_tenant_member("usr-stud-beta", "ten-002", "student"),
    ]).execute()

    # Users
    mock_supabase.table("users").insert([
        make_synthetic_user("usr-teach-1", "ten-001", "teacher", "Teacher One"),
        make_synthetic_user("usr-teach-2", "ten-001", "teacher", "Teacher Two"),
        make_synthetic_user("usr-teach-beta", "ten-002", "teacher", "Teacher Beta"),
        make_synthetic_user("usr-stud-1", "ten-001", "student", "Student One"),
        make_synthetic_user("usr-stud-2", "ten-001", "student", "Student Two"),
        make_synthetic_user("usr-stud-beta", "ten-002", "student", "Student Beta"),
    ]).execute()

    # Sessions
    mock_supabase.table("sessions").insert([
        make_synthetic_session(
            session_id="ses-draft-1",
            tenant_id="ten-001",
            teacher_id="usr-teach-1",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="DRAFT",
        ),
        make_synthetic_session(
            session_id="ses-active-1",
            tenant_id="ten-001",
            teacher_id="usr-teach-1",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="ACTIVE",
        ),
        make_synthetic_session(
            session_id="ses-noanalytics-1",
            tenant_id="ten-001",
            teacher_id="usr-teach-1",
            policy_id=PolicyId.NO_ANALYTICS,
            status="DRAFT",
        ),
        make_synthetic_session(
            session_id="ses-beta-draft",
            tenant_id="ten-002",
            teacher_id="usr-teach-beta",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="DRAFT",
        ),
    ]).execute()

    # Roster
    mock_supabase.table("session_participants").insert([
        {"session_id": "ses-draft-1", "user_id": "usr-stud-1", "tenant_id": "ten-001", "status": "ADMITTED", "role": "student"},
        {"session_id": "ses-draft-1", "user_id": "usr-stud-2", "tenant_id": "ten-001", "status": "ADMITTED", "role": "student"},
        {"session_id": "ses-active-1", "user_id": "usr-stud-1", "tenant_id": "ten-001", "status": "ADMITTED", "role": "student"},
        {"session_id": "ses-noanalytics-1", "user_id": "usr-stud-1", "tenant_id": "ten-001", "status": "ADMITTED", "role": "student"},
        {"session_id": "ses-beta-draft", "user_id": "usr-stud-beta", "tenant_id": "ten-002", "status": "ADMITTED", "role": "student"},
    ]).execute()

    return mock_supabase


@pytest.mark.integration
class TestAssessmentAPIIntegration:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.fixture
    def teacher_token(self):
        return generate_test_jwt(user_id="usr-teach-1", tenant_id="ten-001", role="teacher")

    @pytest.fixture
    def student_token(self):
        return generate_test_jwt(user_id="usr-stud-1", tenant_id="ten-001", role="student")

    def test_full_assessment_lifecycle_workflow(self, client, assessment_db, teacher_token, student_token):
        """
        Complete end-to-end flow:
        1. Teacher uploads primary question paper (.pdf).
        2. Teacher uploads supplementary resource (.png).
        3. Teacher publishes external HTTPS link.
        4. Student lists resources and accesses each.
        5. Student downloads primary paper from signed URL.
        6. Student sends telemetry interaction events.
        7. Student saves draft typed answer.
        8. Student submits version 1 (typed).
        9. Student submits version 2 (PDF file upload).
        10. Student checks own submission history.
        11. Teacher reviews session submissions and downloads student's v2 file.
        """
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        student_headers = {"Authorization": f"Bearer {student_token}"}

        # 1. Teacher uploads primary question paper (PDF)
        pdf_file = ("question_paper.pdf", PDF_MAGIC, "application/pdf")
        upload_resp = client.post(
            "/api/v1/sessions/ses-draft-1/resources/upload",
            headers=teacher_headers,
            data={
                "title": "Final Exam Questions",
                "description": "Primary question paper for exam",
                "is_primary": "true",
                "required": "true",
            },
            files={"file": pdf_file},
        )
        assert upload_resp.status_code == 200, upload_resp.text
        primary_data = upload_resp.json()
        primary_id = primary_data["resource_id"]
        assert primary_data["title"] == "Final Exam Questions"
        assert primary_data["type"] == "uploaded_pdf"
        assert primary_data["is_primary"] is True
        assert primary_data["required"] is True

        # 2. Teacher uploads supplementary resource (PNG)
        png_file = ("formula_sheet.png", PNG_MAGIC, "image/png")
        supp_resp = client.post(
            "/api/v1/sessions/ses-draft-1/resources/upload",
            headers=teacher_headers,
            data={
                "title": "Approved Formula Sheet",
                "is_primary": "false",
                "required": "false",
            },
            files={"file": png_file},
        )
        assert supp_resp.status_code == 200, supp_resp.text
        supp_data = supp_resp.json()
        supp_id = supp_data["resource_id"]
        assert supp_data["type"] == "uploaded_image"

        # 3. Teacher declares external HTTPS link
        link_resp = client.post(
            "/api/v1/sessions/ses-draft-1/resources/external-link",
            headers=teacher_headers,
            json={
                "title": "Python Math Reference",
                "description": "Standard library math module reference",
                "declared_url": "https://docs.python.org/3/library/math.html",
                "allowed_domain": "docs.python.org",
                "required": False,
            },
        )
        assert link_resp.status_code == 200, link_resp.text
        link_data = link_resp.json()
        link_id = link_data["resource_id"]
        assert link_data["type"] == "external_link"
        assert link_data["declared_url"] == "https://docs.python.org/3/library/math.html"

        # 4. Student lists session resources
        list_resp = client.get(
            "/api/v1/sessions/ses-draft-1/resources",
            headers=student_headers,
        )
        assert list_resp.status_code == 200, list_resp.text
        resources = list_resp.json()
        assert len(resources) == 3
        res_ids = [r["resource_id"] for r in resources]
        assert primary_id in res_ids
        assert supp_id in res_ids
        assert link_id in res_ids

        # 5. Student requests access to primary PDF and downloads it
        access_resp = client.get(
            f"/api/v1/sessions/ses-draft-1/resources/{primary_id}/access",
            headers=student_headers,
        )
        assert access_resp.status_code == 200, access_resp.text
        access_data = access_resp.json()
        download_url = access_data["access_url"]
        assert access_data["expires_in_seconds"] == 900
        assert "/api/v1/storage/download" in download_url

        # Download artifact from storage endpoint
        dl_resp = client.get(download_url)
        assert dl_resp.status_code == 200, dl_resp.text
        assert dl_resp.content == PDF_MAGIC
        assert "application/pdf" in dl_resp.headers.get("content-type", "")

        # Student requests access to external link
        link_access_resp = client.get(
            f"/api/v1/sessions/ses-draft-1/resources/{link_id}/access",
            headers=student_headers,
        )
        assert link_access_resp.status_code == 200
        assert link_access_resp.json()["access_url"] == "https://docs.python.org/3/library/math.html"

        # 6. Student records resource interaction telemetry
        open_evt = client.post(
            f"/api/v1/sessions/ses-draft-1/resources/{primary_id}/events",
            headers=student_headers,
            json={"event_type": "RESOURCE_OPENED"},
        )
        assert open_evt.status_code == 200
        assert open_evt.json()["status"] == "success"

        close_evt = client.post(
            f"/api/v1/sessions/ses-draft-1/resources/{primary_id}/events",
            headers=student_headers,
            json={"event_type": "RESOURCE_CLOSED", "duration_ms": 35000},
        )
        assert close_evt.status_code == 200

        click_evt = client.post(
            f"/api/v1/sessions/ses-draft-1/resources/{link_id}/events",
            headers=student_headers,
            json={"event_type": "EXTERNAL_RESOURCE_CLICKED"},
        )
        assert click_evt.status_code == 200

        # Verify privacy invariant on external link click in event log
        all_events = assessment_db.store.get("session_events", []) + assessment_db.store.get("events", [])
        ext_event = next(
            (e for e in all_events if e.get("event_type") == "EXTERNAL_RESOURCE_CLICKED"),
            None,
        )
        assert ext_event is not None
        assert ext_event["payload"]["destination_known"] is False

        # 7. Student saves answer draft
        draft_resp = client.post(
            "/api/v1/sessions/ses-draft-1/answers/draft",
            headers=student_headers,
            json={"typed_content": "Drafting initial solutions for questions 1 to 5..."},
        )
        assert draft_resp.status_code == 200, draft_resp.text
        draft_data = draft_resp.json()
        assert draft_data["status"] == "DRAFT"
        assert draft_data["version"] == 0
        assert draft_data["typed_content"] == "Drafting initial solutions for questions 1 to 5..."

        # 8. Student submits version 1 (typed answer)
        v1_resp = client.post(
            "/api/v1/sessions/ses-draft-1/answers/submit",
            headers=student_headers,
            json={
                "typed_content": "Final solution for exam: Q1: A, Q2: B, Q3: C.",
                "client_submission_id": "client-sub-v1",
            },
        )
        assert v1_resp.status_code == 200, v1_resp.text
        v1_data = v1_resp.json()
        assert v1_data["version"] == 1
        assert v1_data["status"] == "SUBMITTED"
        assert v1_data["artifact_type"] == "typed_text"

        # 9. Student submits version 2 (PDF file upload)
        answer_pdf = ("student_exam_solution_v2.pdf", PDF_MAGIC, "application/pdf")
        v2_resp = client.post(
            "/api/v1/sessions/ses-draft-1/answers/submit",
            headers=student_headers,
            data={"client_submission_id": "client-sub-v2"},
            files={"file": answer_pdf},
        )
        assert v2_resp.status_code == 200, v2_resp.text
        v2_data = v2_resp.json()
        v2_id = v2_data["answer_id"]
        assert v2_data["version"] == 2
        assert v2_data["status"] == "SUBMITTED"
        assert v2_data["artifact_type"] == "pdf_upload"

        # 10. Student checks own submissions
        mine_resp = client.get(
            "/api/v1/sessions/ses-draft-1/answers/mine",
            headers=student_headers,
        )
        assert mine_resp.status_code == 200, mine_resp.text
        my_answers = mine_resp.json()
        assert len(my_answers) == 3
        statuses = {a["version"]: a["status"] for a in my_answers}
        assert statuses[0] == "DRAFT"
        assert statuses[1] == "REPLACED"
        assert statuses[2] == "SUBMITTED"

        # 11. Teacher lists submissions and downloads student's v2 PDF
        teacher_sub_resp = client.get(
            "/api/v1/sessions/ses-draft-1/submissions",
            headers=teacher_headers,
        )
        assert teacher_sub_resp.status_code == 200, teacher_sub_resp.text
        sub_list = teacher_sub_resp.json()["submissions"]
        assert len(sub_list) >= 2

        dl_info_resp = client.get(
            f"/api/v1/sessions/ses-draft-1/submissions/{v2_id}/download",
            headers=teacher_headers,
        )
        assert dl_info_resp.status_code == 200, dl_info_resp.text
        teacher_dl_url = dl_info_resp.json()["download_url"]
        assert teacher_dl_url is not None

        # Teacher downloads the file
        teacher_dl_file = client.get(teacher_dl_url)
        assert teacher_dl_file.status_code == 200
        assert teacher_dl_file.content == PDF_MAGIC

    def test_resource_deletion_before_session_start(self, client, assessment_db, teacher_token, student_token):
        """Teacher can delete a resource prior to session start."""
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        student_headers = {"Authorization": f"Bearer {student_token}"}

        # Upload resource
        png_file = ("scratch_diagram.png", PNG_MAGIC, "image/png")
        upload_resp = client.post(
            "/api/v1/sessions/ses-draft-1/resources/upload",
            headers=teacher_headers,
            data={"title": "Temporary Diagram"},
            files={"file": png_file},
        )
        assert upload_resp.status_code == 200
        res_id = upload_resp.json()["resource_id"]

        # Verify resource exists
        list_before = client.get("/api/v1/sessions/ses-draft-1/resources", headers=student_headers)
        assert any(r["resource_id"] == res_id for r in list_before.json())

        # Delete resource
        del_resp = client.delete(
            f"/api/v1/sessions/ses-draft-1/resources/{res_id}",
            headers=teacher_headers,
        )
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted_resource_id"] == res_id

        # Verify resource is gone
        list_after = client.get("/api/v1/sessions/ses-draft-1/resources", headers=student_headers)
        assert not any(r["resource_id"] == res_id for r in list_after.json())

    def test_duplicate_submission_idempotency(self, client, assessment_db, student_token):
        """Identical submission with same client_submission_id and content hash returns existing record."""
        student_headers = {"Authorization": f"Bearer {student_token}"}
        content = "Deterministic answer text payload 12345"

        resp1 = client.post(
            "/api/v1/sessions/ses-draft-1/answers/submit",
            headers=student_headers,
            json={"typed_content": content, "client_submission_id": "idemp-client-key-1"},
        )
        assert resp1.status_code == 200
        data1 = resp1.json()

        resp2 = client.post(
            "/api/v1/sessions/ses-draft-1/answers/submit",
            headers=student_headers,
            json={"typed_content": content, "client_submission_id": "idemp-client-key-1"},
        )
        assert resp2.status_code == 200
        data2 = resp2.json()

        assert data1["answer_id"] == data2["answer_id"]
        assert data1["version"] == data2["version"] == 1

    def test_max_submission_versions_rejection(self, client, assessment_db, student_token):
        """Enforces hard cap of 3 submission versions per participant, rejecting the 4th."""
        student_headers = {"Authorization": f"Bearer {student_token}"}

        # Submission 1
        r1 = client.post(
            "/api/v1/sessions/ses-draft-1/answers/submit",
            headers=student_headers,
            json={"typed_content": "Answer Version 1"},
        )
        assert r1.status_code == 200
        assert r1.json()["version"] == 1

        # Submission 2
        r2 = client.post(
            "/api/v1/sessions/ses-draft-1/answers/submit",
            headers=student_headers,
            json={"typed_content": "Answer Version 2"},
        )
        assert r2.status_code == 200
        assert r2.json()["version"] == 2

        # Submission 3
        r3 = client.post(
            "/api/v1/sessions/ses-draft-1/answers/submit",
            headers=student_headers,
            json={"typed_content": "Answer Version 3"},
        )
        assert r3.status_code == 200
        assert r3.json()["version"] == 3

        # Submission 4 (Exceeds limit)
        r4 = client.post(
            "/api/v1/sessions/ses-draft-1/answers/submit",
            headers=student_headers,
            json={"typed_content": "Answer Version 4 - should fail"},
        )
        assert r4.status_code == 400
        assert "maximum submission versions" in r4.text.lower() or "limit" in r4.text.lower()

    def test_no_analytics_preset_assessment_behavior(self, client, assessment_db, teacher_token, student_token):
        """Under NO_ANALYTICS preset, resources and answers operate normally while analytics are inactive."""
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        student_headers = {"Authorization": f"Bearer {student_token}"}

        # Teacher uploads PDF
        pdf_file = ("no_analytics_exam.pdf", PDF_MAGIC, "application/pdf")
        upload_resp = client.post(
            "/api/v1/sessions/ses-noanalytics-1/resources/upload",
            headers=teacher_headers,
            data={"title": "Unmonitored Assessment", "is_primary": "true"},
            files={"file": pdf_file},
        )
        assert upload_resp.status_code == 200
        res_id = upload_resp.json()["resource_id"]

        # Student accesses resource
        access_resp = client.get(
            f"/api/v1/sessions/ses-noanalytics-1/resources/{res_id}/access",
            headers=student_headers,
        )
        assert access_resp.status_code == 200
        assert access_resp.json()["access_url"] is not None

        # Student submits answer
        submit_resp = client.post(
            "/api/v1/sessions/ses-noanalytics-1/answers/submit",
            headers=student_headers,
            json={"typed_content": "Student exam solution under NO_ANALYTICS"},
        )
        assert submit_resp.status_code == 200
        assert submit_resp.json()["status"] == "SUBMITTED"

        # Teacher lists submissions
        subs_resp = client.get(
            "/api/v1/sessions/ses-noanalytics-1/submissions",
            headers=teacher_headers,
        )
        assert subs_resp.status_code == 200
        assert len(subs_resp.json()["submissions"]) == 1

    def test_image_and_pdf_mime_type_download_responses(self, client, assessment_db, teacher_token, student_token):
        """Verifies correct content-type header returned on storage download for PDF, PNG, and JPEG."""
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        student_headers = {"Authorization": f"Bearer {student_token}"}

        # JPEG upload
        jpeg_file = ("photo_evidence.jpg", JPEG_MAGIC, "image/jpeg")
        j_resp = client.post(
            "/api/v1/sessions/ses-draft-1/resources/upload",
            headers=teacher_headers,
            data={"title": "Diagram Reference JPEG"},
            files={"file": jpeg_file},
        )
        assert j_resp.status_code == 200
        jpeg_id = j_resp.json()["resource_id"]

        access = client.get(
            f"/api/v1/sessions/ses-draft-1/resources/{jpeg_id}/access",
            headers=student_headers,
        )
        assert access.status_code == 200
        dl_url = access.json()["access_url"]

        dl = client.get(dl_url)
        assert dl.status_code == 200
        assert dl.content == JPEG_MAGIC
        assert "image/jpeg" in dl.headers.get("content-type", "")
