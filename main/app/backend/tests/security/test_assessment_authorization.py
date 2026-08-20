"""
Security and Authorization Test Suite for Assessment Subsystem.
Tests tenant boundary isolation, role-based access control, session immutability,
availability window enforcement, binary security validations, and HMAC download protections.
"""
import time
from datetime import datetime, timezone, timedelta
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


@pytest.fixture
def authz_db(mock_supabase: MockSupabaseClient):
    """Seed multi-tenant database for assessment security and authorization tests."""
    mock_supabase.reset()

    # Tenants
    mock_supabase.table("tenants").insert([
        make_synthetic_tenant("ten-alpha", "Tenant Alpha"),
        make_synthetic_tenant("ten-beta", "Tenant Beta"),
    ]).execute()

    # Tenant Members
    mock_supabase.table("tenant_members").insert([
        make_synthetic_tenant_member("usr-teach-alpha-1", "ten-alpha", "teacher"),
        make_synthetic_tenant_member("usr-teach-alpha-2", "ten-alpha", "teacher"),
        make_synthetic_tenant_member("usr-teach-beta", "ten-beta", "teacher"),
        make_synthetic_tenant_member("usr-stud-alpha-1", "ten-alpha", "student"),
        make_synthetic_tenant_member("usr-stud-alpha-2", "ten-alpha", "student"),
        make_synthetic_tenant_member("usr-stud-beta", "ten-beta", "student"),
    ]).execute()

    # Users
    mock_supabase.table("users").insert([
        make_synthetic_user("usr-teach-alpha-1", "ten-alpha", "teacher", "Teacher Alpha Assigned"),
        make_synthetic_user("usr-teach-alpha-2", "ten-alpha", "teacher", "Teacher Alpha Unassigned"),
        make_synthetic_user("usr-teach-beta", "ten-beta", "teacher", "Teacher Beta"),
        make_synthetic_user("usr-stud-alpha-1", "ten-alpha", "student", "Student Alpha 1"),
        make_synthetic_user("usr-stud-alpha-2", "ten-alpha", "student", "Student Alpha 2"),
        make_synthetic_user("usr-stud-beta", "ten-beta", "student", "Student Beta"),
    ]).execute()

    # Sessions
    mock_supabase.table("sessions").insert([
        make_synthetic_session(
            session_id="ses-alpha-draft",
            tenant_id="ten-alpha",
            teacher_id="usr-teach-alpha-1",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="DRAFT",
        ),
        make_synthetic_session(
            session_id="ses-alpha-active",
            tenant_id="ten-alpha",
            teacher_id="usr-teach-alpha-1",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="ACTIVE",
        ),
        make_synthetic_session(
            session_id="ses-alpha-ended",
            tenant_id="ten-alpha",
            teacher_id="usr-teach-alpha-1",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="ENDED",
        ),
        make_synthetic_session(
            session_id="ses-beta-draft",
            tenant_id="ten-beta",
            teacher_id="usr-teach-beta",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="DRAFT",
        ),
    ]).execute()

    # Roster
    mock_supabase.table("session_participants").insert([
        {"session_id": "ses-alpha-draft", "user_id": "usr-stud-alpha-1", "tenant_id": "ten-alpha", "status": "ADMITTED", "role": "student"},
        {"session_id": "ses-alpha-active", "user_id": "usr-stud-alpha-1", "tenant_id": "ten-alpha", "status": "ADMITTED", "role": "student"},
        {"session_id": "ses-beta-draft", "user_id": "usr-stud-beta", "tenant_id": "ten-beta", "status": "ADMITTED", "role": "student"},
    ]).execute()

    return mock_supabase


@pytest.mark.security
class TestAssessmentAuthorizationSecurity:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.fixture
    def teacher_alpha_token(self):
        return generate_test_jwt(user_id="usr-teach-alpha-1", tenant_id="ten-alpha", role="teacher")

    @pytest.fixture
    def teacher_unassigned_token(self):
        return generate_test_jwt(user_id="usr-teach-alpha-2", tenant_id="ten-alpha", role="teacher")

    @pytest.fixture
    def teacher_beta_token(self):
        return generate_test_jwt(user_id="usr-teach-beta", tenant_id="ten-beta", role="teacher")

    @pytest.fixture
    def student_alpha_token(self):
        return generate_test_jwt(user_id="usr-stud-alpha-1", tenant_id="ten-alpha", role="student")

    @pytest.fixture
    def student_beta_token(self):
        return generate_test_jwt(user_id="usr-stud-beta", tenant_id="ten-beta", role="student")

    # 1. Unauthenticated Requests -> 401
    def test_unauthenticated_requests_rejected(self, client, authz_db):
        routes = [
            ("POST", "/api/v1/sessions/ses-alpha-draft/resources/upload"),
            ("POST", "/api/v1/sessions/ses-alpha-draft/resources/external-link"),
            ("DELETE", "/api/v1/sessions/ses-alpha-draft/resources/some-res-id"),
            ("GET", "/api/v1/sessions/ses-alpha-draft/resources"),
            ("GET", "/api/v1/sessions/ses-alpha-draft/resources/some-res-id/access"),
            ("POST", "/api/v1/sessions/ses-alpha-draft/answers/draft"),
            ("POST", "/api/v1/sessions/ses-alpha-draft/answers/submit"),
            ("GET", "/api/v1/sessions/ses-alpha-draft/answers/mine"),
            ("GET", "/api/v1/sessions/ses-alpha-draft/submissions"),
        ]
        for method, route in routes:
            if method == "POST":
                resp = client.post(route, json={})
            elif method == "DELETE":
                resp = client.delete(route)
            else:
                resp = client.get(route)
            assert resp.status_code == 401, f"{method} {route} did not return 401"

    # 2. Expired Token -> 401
    def test_expired_token_rejected(self, client, authz_db):
        expired = generate_test_jwt(
            user_id="usr-teach-alpha-1",
            tenant_id="ten-alpha",
            role="teacher",
            expires_in_seconds=-60,
        )
        resp = client.get(
            "/api/v1/sessions/ses-alpha-draft/resources",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert resp.status_code == 401

    # 3. Cross-Tenant Resource Access Denied -> 404
    def test_cross_tenant_resource_access_denied(self, client, authz_db, teacher_beta_token, student_beta_token):
        """Tenants cannot access or discover resources from other tenants."""
        # Tenant Beta teacher attempts to list Tenant Alpha session resources
        resp1 = client.get(
            "/api/v1/sessions/ses-alpha-draft/resources",
            headers={"Authorization": f"Bearer {teacher_beta_token}"},
        )
        assert resp1.status_code == 404

        # Tenant Beta student attempts to list Tenant Alpha session resources
        resp2 = client.get(
            "/api/v1/sessions/ses-alpha-draft/resources",
            headers={"Authorization": f"Bearer {student_beta_token}"},
        )
        assert resp2.status_code == 404

        # Tenant Beta student attempts to submit draft to Tenant Alpha session
        resp3 = client.post(
            "/api/v1/sessions/ses-alpha-draft/answers/draft",
            headers={"Authorization": f"Bearer {student_beta_token}"},
            json={"typed_content": "Intruder draft"},
        )
        assert resp3.status_code == 404

        # Tenant Beta student attempts to submit answer to Tenant Alpha session
        resp4 = client.post(
            "/api/v1/sessions/ses-alpha-draft/answers/submit",
            headers={"Authorization": f"Bearer {student_beta_token}"},
            json={"typed_content": "Intruder answer"},
        )
        assert resp4.status_code == 404

    # 4. Cross-Session Resource Access Denied -> 404
    def test_cross_session_resource_access_denied(self, client, authz_db, teacher_alpha_token, student_alpha_token):
        """Requesting resource access using a resource ID from a different session is rejected."""
        teacher_headers = {"Authorization": f"Bearer {teacher_alpha_token}"}
        student_headers = {"Authorization": f"Bearer {student_alpha_token}"}

        # Upload resource to ses-alpha-draft
        pdf_file = ("paper.pdf", PDF_MAGIC, "application/pdf")
        upload_resp = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=teacher_headers,
            data={"title": "Session 1 Resource"},
            files={"file": pdf_file},
        )
        assert upload_resp.status_code == 200
        res_id = upload_resp.json()["resource_id"]

        # Attempt to access resource via ses-alpha-active endpoint
        access_resp = client.get(
            f"/api/v1/sessions/ses-alpha-active/resources/{res_id}/access",
            headers=student_headers,
        )
        assert access_resp.status_code == 404

    # 5. Wrong Teacher Resource Operations Denied -> 403
    def test_unassigned_teacher_operations_denied(self, client, authz_db, teacher_unassigned_token, teacher_alpha_token):
        """Teachers not assigned to a session cannot upload, delete, or review submissions."""
        unassigned_headers = {"Authorization": f"Bearer {teacher_unassigned_token}"}
        assigned_headers = {"Authorization": f"Bearer {teacher_alpha_token}"}

        # Upload by unassigned teacher -> 403
        pdf_file = ("paper.pdf", PDF_MAGIC, "application/pdf")
        r_upload = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=unassigned_headers,
            data={"title": "Unauthorized Upload"},
            files={"file": pdf_file},
        )
        assert r_upload.status_code == 403

        # External link by unassigned teacher -> 403
        r_link = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/external-link",
            headers=unassigned_headers,
            json={"title": "Unauthorized Link", "declared_url": "https://example.com/math"},
        )
        assert r_link.status_code == 403

        # Upload resource properly by assigned teacher first
        res_upload = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=assigned_headers,
            data={"title": "Legitimate Paper"},
            files={"file": ("legit.pdf", PDF_MAGIC, "application/pdf")},
        )
        assert res_upload.status_code == 200
        res_id = res_upload.json()["resource_id"]

        # Delete by unassigned teacher -> 403
        r_del = client.delete(
            f"/api/v1/sessions/ses-alpha-draft/resources/{res_id}",
            headers=unassigned_headers,
        )
        assert r_del.status_code == 403

        # Review submissions by unassigned teacher -> 403
        r_subs = client.get(
            "/api/v1/sessions/ses-alpha-draft/submissions",
            headers=unassigned_headers,
        )
        assert r_subs.status_code == 403

    # 6. Student Cannot Execute Teacher Operations -> 403
    def test_student_cannot_upload_or_delete_resources(self, client, authz_db, student_alpha_token, teacher_alpha_token):
        """Students cannot upload resources, create links, or delete resources."""
        student_headers = {"Authorization": f"Bearer {student_alpha_token}"}
        teacher_headers = {"Authorization": f"Bearer {teacher_alpha_token}"}

        # Student resource upload -> 403
        pdf_file = ("paper.pdf", PDF_MAGIC, "application/pdf")
        r_upload = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=student_headers,
            data={"title": "Student Upload"},
            files={"file": pdf_file},
        )
        assert r_upload.status_code == 403

        # Student external link -> 403
        r_link = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/external-link",
            headers=student_headers,
            json={"title": "Student Link", "declared_url": "https://example.com"},
        )
        assert r_link.status_code == 403

        # Upload by teacher then student delete -> 403
        legit = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=teacher_headers,
            data={"title": "Exam Paper"},
            files={"file": ("exam.pdf", PDF_MAGIC, "application/pdf")},
        )
        res_id = legit.json()["resource_id"]

        r_del = client.delete(
            f"/api/v1/sessions/ses-alpha-draft/resources/{res_id}",
            headers=student_headers,
        )
        assert r_del.status_code == 403

        # Student cannot list all teacher submissions -> 403
        r_subs = client.get(
            "/api/v1/sessions/ses-alpha-draft/submissions",
            headers=student_headers,
        )
        assert r_subs.status_code == 403

    # 7. Resource Mutation After Session Start Rejected -> 409
    def test_resource_mutation_after_session_start_rejected(self, client, authz_db, teacher_alpha_token):
        """Active or ended sessions reject resource additions, updates, and deletions."""
        teacher_headers = {"Authorization": f"Bearer {teacher_alpha_token}"}

        # Attempt upload to ACTIVE session -> 409
        pdf_file = ("active_paper.pdf", PDF_MAGIC, "application/pdf")
        r_active = client.post(
            "/api/v1/sessions/ses-alpha-active/resources/upload",
            headers=teacher_headers,
            data={"title": "Late Upload Active"},
            files={"file": pdf_file},
        )
        assert r_active.status_code == 409

        # Attempt external link to ACTIVE session -> 409
        r_link_active = client.post(
            "/api/v1/sessions/ses-alpha-active/resources/external-link",
            headers=teacher_headers,
            json={"title": "Late Link Active", "declared_url": "https://example.com/ref"},
        )
        assert r_link_active.status_code == 409

        # Attempt upload to ENDED session -> 409
        r_ended = client.post(
            "/api/v1/sessions/ses-alpha-ended/resources/upload",
            headers=teacher_headers,
            data={"title": "Late Upload Ended"},
            files={"file": pdf_file},
        )
        assert r_ended.status_code == 409

    # 8. Expired Resource Window Rejected -> 403
    def test_resource_availability_window_restrictions(self, client, authz_db, teacher_alpha_token, student_alpha_token):
        """Resources outside their declared availability windows (allowed_from / allowed_until) return 403."""
        teacher_headers = {"Authorization": f"Bearer {teacher_alpha_token}"}
        student_headers = {"Authorization": f"Bearer {student_alpha_token}"}

        now = datetime.now(timezone.utc)
        past_iso = (now - timedelta(hours=2)).isoformat()
        future_iso = (now + timedelta(hours=2)).isoformat()

        # 1. Resource whose window has already expired
        pdf_expired = ("expired.pdf", PDF_MAGIC, "application/pdf")
        r1 = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=teacher_headers,
            data={"title": "Expired Window Paper", "allowed_until": past_iso},
            files={"file": pdf_expired},
        )
        assert r1.status_code == 200
        expired_id = r1.json()["resource_id"]

        access_exp = client.get(
            f"/api/v1/sessions/ses-alpha-draft/resources/{expired_id}/access",
            headers=student_headers,
        )
        assert access_exp.status_code == 403
        assert "expired" in access_exp.text.lower() or "not available" in access_exp.text.lower()

        # 2. Resource whose window has not yet opened
        pdf_future = ("future.pdf", PDF_MAGIC, "application/pdf")
        r2 = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=teacher_headers,
            data={"title": "Future Window Paper", "allowed_from": future_iso},
            files={"file": pdf_future},
        )
        assert r2.status_code == 200
        future_id = r2.json()["resource_id"]

        access_fut = client.get(
            f"/api/v1/sessions/ses-alpha-draft/resources/{future_id}/access",
            headers=student_headers,
        )
        assert access_fut.status_code == 403
        assert "not yet open" in access_fut.text.lower() or "not available" in access_fut.text.lower()

    # 9. Oversized (>20MB) and Disallowed Binary File Validation -> 400
    def test_binary_validation_and_size_limits(self, client, authz_db, teacher_alpha_token, student_alpha_token):
        """Files exceeding 20MB or failing binary magic inspection are rejected."""
        teacher_headers = {"Authorization": f"Bearer {teacher_alpha_token}"}
        student_headers = {"Authorization": f"Bearer {student_alpha_token}"}

        # 1. Oversized file (>20MB)
        oversized_bytes = PDF_MAGIC + (b"0" * (20 * 1024 * 1024 + 1024))
        r_over = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=teacher_headers,
            data={"title": "Oversized Paper"},
            files={"file": ("oversized.pdf", oversized_bytes, "application/pdf")},
        )
        assert r_over.status_code == 400
        assert "exceeds maximum allowed limit" in r_over.text.lower() or "size" in r_over.text.lower()

        # 2. Invalid magic header / executable
        exe_bytes = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00"
        r_exe = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=teacher_headers,
            data={"title": "Executable Disguised as PDF"},
            files={"file": ("malware.pdf", exe_bytes, "application/pdf")},
        )
        assert r_exe.status_code == 400
        assert "magic header" in r_exe.text.lower() or "format" in r_exe.text.lower()

        # 3. Disallowed extension (.txt)
        txt_bytes = b"Plain text file"
        r_txt = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=teacher_headers,
            data={"title": "Plain text note"},
            files={"file": ("note.txt", txt_bytes, "text/plain")},
        )
        assert r_txt.status_code == 400

        # 4. Student answer submission oversized (>20MB)
        r_sub_over = client.post(
            "/api/v1/sessions/ses-alpha-draft/answers/submit",
            headers=student_headers,
            files={"file": ("large_answer.pdf", oversized_bytes, "application/pdf")},
        )
        assert r_sub_over.status_code == 400

    # 10. External Link HTTPS and Domain Restrictions -> 400
    def test_external_link_security_validations(self, client, authz_db, teacher_alpha_token):
        """Insecure HTTP protocols and domain mismatches are strictly rejected."""
        teacher_headers = {"Authorization": f"Bearer {teacher_alpha_token}"}

        # Plain HTTP
        r_http = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/external-link",
            headers=teacher_headers,
            json={"title": "Insecure Link", "declared_url": "http://insecure.example.com"},
        )
        assert r_http.status_code == 400
        assert "https" in r_http.text.lower()

        # Domain mismatch
        r_mismatch = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/external-link",
            headers=teacher_headers,
            json={
                "title": "Mismatched Domain",
                "declared_url": "https://malicious.example.org/docs",
                "allowed_domain": "trusted.example.com",
            },
        )
        assert r_mismatch.status_code == 400
        assert "does not match" in r_mismatch.text.lower()

    # 11. Storage Download HMAC Tampering and Expiration -> 403
    def test_storage_download_hmac_tampering_and_expiration(self, client, authz_db, teacher_alpha_token, student_alpha_token):
        """Download requests with tampered HMAC signatures or expired timestamps are rejected."""
        teacher_headers = {"Authorization": f"Bearer {teacher_alpha_token}"}
        student_headers = {"Authorization": f"Bearer {student_alpha_token}"}

        # Upload valid resource
        upload_resp = client.post(
            "/api/v1/sessions/ses-alpha-draft/resources/upload",
            headers=teacher_headers,
            data={"title": "Protected Paper"},
            files={"file": ("protected.pdf", PDF_MAGIC, "application/pdf")},
        )
        res_id = upload_resp.json()["resource_id"]

        # Get signed access URL
        access = client.get(
            f"/api/v1/sessions/ses-alpha-draft/resources/{res_id}/access",
            headers=student_headers,
        )
        valid_url = access.json()["access_url"]

        # Verify valid download works
        valid_dl = client.get(valid_url)
        assert valid_dl.status_code == 200

        # Tampered signature
        tampered_url = valid_url[:-8] + "00000000"
        tampered_resp = client.get(tampered_url)
        assert tampered_resp.status_code == 403

        # Expired timestamp
        expired_url = valid_url.replace("expires_at=", "expires_at=1000000&orig=")
        expired_resp = client.get(expired_url)
        assert expired_resp.status_code == 403
