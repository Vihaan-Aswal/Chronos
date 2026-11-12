"""
Chronos Unit Tests - Assessment Domain Services
Workstream: Resource-Supported Assessment Vertical Slice

Exhaustively verifies:
1. ResourceService:
   - Resource publishing (Primary vs Supplementary, PDF/PNG/JPG).
   - Capacity limits (1 primary question paper, max 5 supplementary files, max 5 external links).
   - Session immutability enforcement after start (ACTIVE, ENDED, EXPIRED).
   - HTTPS validation and domain matching for external links.
   - Time-windowed availability checks (allowed_from / allowed_until).
   - Resource deletion before session start.
   - Interaction telemetry events and privacy invariant (destination_known: False).
   - Signed expiring URL creation.
2. AnswerService:
   - Typed draft auto-saving (version 0, unconsumed quota).
   - Typed and file submission workflows.
   - Version progression (1 -> 2 -> 3) and max 3 version capacity limit.
   - 4th submission version rejection.
   - Idempotency with duplicate client_submission_id and content hash.
   - Deadline evaluation and late submission classification (status="LATE", ANSWER_MARKED_LATE).
   - Previous version replacement (SUBMITTED -> REPLACED).
   - Teacher submission review authorization and role-based download URL access.
"""
import uuid
from datetime import datetime, timezone, timedelta
import pytest

from assessment.resource_service import ResourceService
from assessment.answer_service import AnswerService
from contracts import ActorRole, EventType, PolicyId
from repository import ChronosDomainRepository
from storage.storage_service import (
    LocalStorageService,
    StorageValidationError,
    compute_content_hash,
)

# Test Binary Fixtures
VALID_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
VALID_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
VALID_JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xd9"
INVALID_BINARY_BYTES = b"INVALID_BINARY_HEADER_NOT_PDF_OR_IMAGE"


@pytest.fixture
def repo(mock_supabase) -> ChronosDomainRepository:
    return ChronosDomainRepository(mock_supabase)


@pytest.fixture
def storage() -> LocalStorageService:
    return LocalStorageService()


@pytest.fixture
def resource_service(repo, storage) -> ResourceService:
    return ResourceService(repository=repo, storage_service=storage)


@pytest.fixture
def answer_service(repo, storage) -> AnswerService:
    return AnswerService(repository=repo, storage_service=storage)


@pytest.fixture
def sample_session(repo):
    tenant_id = "ten-00000001"
    session_id = "ses-assess-001"
    teacher_id = "usr-teacher-001"

    # Setup tenant and teacher membership
    repo.db.table("tenants").insert({"id": tenant_id, "name": "Test Academy"}).execute()
    repo.db.table("users").insert({
        "user_id": teacher_id,
        "tenant_id": tenant_id,
        "role": "teacher",
        "email": "teacher@test.com",
    }).execute()
    repo.db.table("tenant_members").insert({
        "tenant_id": tenant_id,
        "user_id": teacher_id,
        "role": "teacher",
    }).execute()

    session_data = {
        "session_id": session_id,
        "tenant_id": tenant_id,
        "teacher_id": teacher_id,
        "title": "Mathematics Midterm Assessment",
        "status": "DRAFT",
        "policy_id": PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(),
    }
    repo.create_session(session_data)
    return session_data


# ===========================================================================
# 1. Resource Service Tests
# ===========================================================================

class TestResourceService:

    def test_publish_primary_question_paper_success(self, resource_service, repo, sample_session):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        teacher_id = sample_session["teacher_id"]

        res = resource_service.publish_uploaded_resource(
            session_id=session_id,
            tenant_id=tenant_id,
            actor_id=teacher_id,
            title="Calculus Final Exam Paper",
            description="Official Question Paper 2026",
            file_bytes=VALID_PDF_BYTES,
            filename="calculus_exam.pdf",
            content_type="application/pdf",
            is_primary=True,
            required=True,
        )

        assert res["resource_id"] is not None
        assert res["session_id"] == session_id
        assert res["type"] == "uploaded_pdf"
        assert res["is_primary"] is True
        assert res["required"] is True
        assert res["content_hash"] == compute_content_hash(VALID_PDF_BYTES)
        assert res["size_bytes"] == len(VALID_PDF_BYTES)
        assert "resources/" in res["storage_path"]

        # Check repository projection
        persisted = repo.get_resource_by_id(res["resource_id"])
        assert persisted is not None
        assert persisted["title"] == "Calculus Final Exam Paper"

        # Check durable event emission
        events = repo.get_session_events(session_id)
        pub_events = [e for e in events if e.get("event_type") == EventType.RESOURCE_PUBLISHED]
        assert len(pub_events) == 1
        assert pub_events[0]["payload"]["is_primary"] is True
        assert pub_events[0]["payload"]["content_hash"] == compute_content_hash(VALID_PDF_BYTES)

    def test_publish_duplicate_primary_question_paper_rejected(
        self, resource_service, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        teacher_id = sample_session["teacher_id"]

        # 1st primary succeeds
        resource_service.publish_uploaded_resource(
            session_id=session_id,
            tenant_id=tenant_id,
            actor_id=teacher_id,
            title="Question Paper 1",
            file_bytes=VALID_PDF_BYTES,
            filename="paper1.pdf",
            is_primary=True,
        )

        # 2nd primary fails capacity limit
        with pytest.raises(ValueError, match="primary question paper is already published"):
            resource_service.publish_uploaded_resource(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                title="Question Paper 2",
                file_bytes=VALID_PDF_BYTES,
                filename="paper2.pdf",
                is_primary=True,
            )

    def test_publish_supplementary_resources_and_capacity_limit(
        self, resource_service, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        teacher_id = sample_session["teacher_id"]

        # Publish 1 primary
        resource_service.publish_uploaded_resource(
            session_id=session_id,
            tenant_id=tenant_id,
            actor_id=teacher_id,
            title="Primary Paper",
            file_bytes=VALID_PDF_BYTES,
            filename="paper.pdf",
            is_primary=True,
        )

        # Publish 5 supplementary resources (mix of PDF, PNG, JPG)
        files = [
            ("Formula Sheet.pdf", VALID_PDF_BYTES, "application/pdf"),
            ("Diagram 1.png", VALID_PNG_BYTES, "image/png"),
            ("Graph 2.jpg", VALID_JPEG_BYTES, "image/jpeg"),
            ("Reference 3.pdf", VALID_PDF_BYTES, "application/pdf"),
            ("Table 4.png", VALID_PNG_BYTES, "image/png"),
        ]

        for idx, (fname, content, mime) in enumerate(files, start=1):
            res = resource_service.publish_uploaded_resource(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                title=f"Supplement {idx}",
                file_bytes=content,
                filename=fname,
                content_type=mime,
                is_primary=False,
            )
            assert res is not None

        # 6th supplementary resource must be rejected
        with pytest.raises(ValueError, match="Maximum supplementary uploaded resources"):
            resource_service.publish_uploaded_resource(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                title="Supplement 6 - Exceeds Limit",
                file_bytes=VALID_PDF_BYTES,
                filename="extra.pdf",
                is_primary=False,
            )

    def test_publish_external_links_capacity_limit_and_https_validation(
        self, resource_service, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        teacher_id = sample_session["teacher_id"]

        # HTTP link rejected
        with pytest.raises(ValueError, match="HTTPS protocol"):
            resource_service.publish_external_link(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                title="Insecure Link",
                declared_url="http://insecure-docs.example.com",
            )

        # Domain mismatch rejected
        with pytest.raises(ValueError, match="does not match specified allowed domain"):
            resource_service.publish_external_link(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                title="Docs",
                declared_url="https://evil.com/docs",
                allowed_domain="trusted-docs.org",
            )

        # Publish 5 valid HTTPS external links
        for i in range(1, 6):
            res = resource_service.publish_external_link(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                title=f"External Reference {i}",
                declared_url=f"https://docs.reference-{i}.org/guide",
                allowed_domain=f"docs.reference-{i}.org",
            )
            assert res["type"] == "external_link"

        # 6th external link rejected
        with pytest.raises(ValueError, match="Maximum external links"):
            resource_service.publish_external_link(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                title="External Reference 6",
                declared_url="https://docs.reference-6.org/guide",
            )

    def test_resource_immutability_after_session_start(
        self, resource_service, repo, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        teacher_id = sample_session["teacher_id"]

        # 1. Publish in DRAFT state
        res = resource_service.publish_uploaded_resource(
            session_id=session_id,
            tenant_id=tenant_id,
            actor_id=teacher_id,
            title="Draft Resource",
            file_bytes=VALID_PDF_BYTES,
            filename="draft.pdf",
        )
        resource_id = res["resource_id"]

        # 2. Start session -> ACTIVE
        repo.start_session(
            session_id=session_id,
            tenant_id=tenant_id,
            policy_snapshot={"policy_id": "RESOURCE_SUPPORTED_ASSESSMENT"},
            started_at=datetime.now(timezone.utc).isoformat(),
        )

        # 3. Attempting to add uploaded resource in ACTIVE state is rejected
        with pytest.raises(ValueError, match="Cannot add or modify resources after session has started"):
            resource_service.publish_uploaded_resource(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                title="Late Resource",
                file_bytes=VALID_PDF_BYTES,
                filename="late.pdf",
            )

        # 4. Attempting to add external link in ACTIVE state is rejected
        with pytest.raises(ValueError, match="Cannot add or modify resources after session has started"):
            resource_service.publish_external_link(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                title="Late Link",
                declared_url="https://late-docs.org",
            )

        # 5. Attempting to delete resource in ACTIVE state is rejected
        with pytest.raises(ValueError, match="Cannot delete resources after session has started"):
            resource_service.delete_resource(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                resource_id=resource_id,
            )

        # 6. End session -> ENDED, still rejected
        repo.end_session(
            session_id=session_id,
            tenant_id=tenant_id,
            ended_at=datetime.now(timezone.utc).isoformat(),
        )
        with pytest.raises(ValueError, match="Cannot add or modify resources after session has started"):
            resource_service.publish_uploaded_resource(
                session_id=session_id,
                tenant_id=tenant_id,
                actor_id=teacher_id,
                title="Post-End Resource",
                file_bytes=VALID_PDF_BYTES,
                filename="post.pdf",
            )

    def test_delete_resource_in_draft_session(
        self, resource_service, repo, storage, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        teacher_id = sample_session["teacher_id"]

        res = resource_service.publish_uploaded_resource(
            session_id=session_id,
            tenant_id=tenant_id,
            actor_id=teacher_id,
            title="Temporary Resource",
            file_bytes=VALID_PDF_BYTES,
            filename="temp.pdf",
        )
        resource_id = res["resource_id"]
        storage_path = res["storage_path"]

        assert storage.exists(storage_path) is True
        assert repo.get_resource_by_id(resource_id) is not None

        # Delete resource
        success = resource_service.delete_resource(
            session_id=session_id,
            tenant_id=tenant_id,
            actor_id=teacher_id,
            resource_id=resource_id,
        )
        assert success is True
        assert storage.exists(storage_path) is False
        assert repo.get_resource_by_id(resource_id) is None

    def test_resource_availability_window_restrictions(
        self, resource_service, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        teacher_id = sample_session["teacher_id"]
        participant_id = "usr-student-001"

        now = datetime.now(timezone.utc)

        # Resource 1: Future window (not yet open)
        res_future = resource_service.publish_uploaded_resource(
            session_id=session_id,
            tenant_id=tenant_id,
            actor_id=teacher_id,
            title="Future Resource",
            file_bytes=VALID_PDF_BYTES,
            filename="future.pdf",
            allowed_from=(now + timedelta(hours=2)).isoformat(),
        )

        with pytest.raises(PermissionError, match="not available at this time"):
            resource_service.get_resource_access(
                session_id=session_id,
                tenant_id=tenant_id,
                participant_id=participant_id,
                resource_id=res_future["resource_id"],
            )

        # Resource 2: Expired window
        res_expired = resource_service.publish_uploaded_resource(
            session_id=session_id,
            tenant_id=tenant_id,
            actor_id=teacher_id,
            title="Expired Resource",
            file_bytes=VALID_PDF_BYTES,
            filename="expired.pdf",
            allowed_until=(now - timedelta(minutes=5)).isoformat(),
        )

        with pytest.raises(PermissionError, match="not available at this time"):
            resource_service.get_resource_access(
                session_id=session_id,
                tenant_id=tenant_id,
                participant_id=participant_id,
                resource_id=res_expired["resource_id"],
            )

        # Resource 3: Valid active window
        res_valid = resource_service.publish_uploaded_resource(
            session_id=session_id,
            tenant_id=tenant_id,
            actor_id=teacher_id,
            title="Active Window Resource",
            file_bytes=VALID_PDF_BYTES,
            filename="active.pdf",
            allowed_from=(now - timedelta(minutes=10)).isoformat(),
            allowed_until=(now + timedelta(hours=1)).isoformat(),
        )

        access = resource_service.get_resource_access(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            resource_id=res_valid["resource_id"],
        )
        assert access["resource_id"] == res_valid["resource_id"]
        assert access["expires_in_seconds"] == 900
        assert "download?path=" in access["access_url"]

    def test_record_resource_interaction_and_privacy_invariant(
        self, resource_service, repo, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        participant_id = "usr-student-001"

        link_res = resource_service.publish_external_link(
            session_id=session_id,
            tenant_id=tenant_id,
            actor_id=sample_session["teacher_id"],
            title="Python Docs",
            declared_url="https://docs.python.org/3/",
        )
        resource_id = link_res["resource_id"]

        # Record open event
        resource_service.record_resource_interaction(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            resource_id=resource_id,
            event_type="RESOURCE_OPENED",
        )

        # Record external click event
        resource_service.record_resource_interaction(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            resource_id=resource_id,
            event_type="EXTERNAL_RESOURCE_CLICKED",
            duration_ms=4500,
        )

        # Record close event
        resource_service.record_resource_interaction(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            resource_id=resource_id,
            event_type="RESOURCE_CLOSED",
            duration_ms=5000,
        )

        events = repo.get_participant_events(session_id, participant_id)
        assert len(events) == 3

        ext_event = next(e for e in events if e["event_type"] == "EXTERNAL_RESOURCE_CLICKED")
        payload = ext_event["payload"]
        # CRITICAL PRIVACY INVARIANT: destination_known MUST be False
        assert payload["destination_known"] is False
        assert payload["declared_resource_opened_recently"] is True
        assert payload["associated_declared_resource_id"] == resource_id


# ===========================================================================
# 2. Answer Service Tests
# ===========================================================================

class TestAnswerService:

    def test_save_draft_success(self, answer_service, repo, sample_session):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        participant_id = "usr-student-001"

        typed_text = "def solve_quadratic(a, b, c):\n    return (-b + (b**2 - 4*a*c)**0.5) / (2*a)"
        draft = answer_service.save_draft(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            typed_content=typed_text,
        )

        assert draft["answer_id"] is not None
        assert draft["version"] == 0
        assert draft["status"] == "DRAFT"
        assert draft["artifact_type"] == "typed_text"
        assert draft["content_hash"] == compute_content_hash(typed_text.encode("utf-8"))
        assert draft["byte_size"] == len(typed_text.encode("utf-8"))

        # Check repository record
        answers = repo.get_participant_answers(session_id, participant_id)
        assert len(answers) == 1
        assert answers[0]["status"] == "DRAFT"

        # Check event
        events = repo.get_participant_events(session_id, participant_id)
        assert len(events) == 1
        assert events[0]["event_type"] == EventType.ANSWER_DRAFT_SAVED

    def test_save_draft_rejected_when_session_ended(
        self, answer_service, repo, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        participant_id = "usr-student-001"

        repo.end_session(
            session_id=session_id,
            tenant_id=tenant_id,
            ended_at=datetime.now(timezone.utc).isoformat(),
        )

        with pytest.raises(ValueError, match="Cannot save draft for session in 'ENDED' status"):
            answer_service.save_draft(
                session_id=session_id,
                tenant_id=tenant_id,
                participant_id=participant_id,
                typed_content="Too late",
            )

    def test_submit_typed_and_file_answers_version_progression_1_to_3(
        self, answer_service, repo, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        participant_id = "usr-student-001"

        # Version 1: Typed submission
        v1 = answer_service.submit_answer(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            typed_content="Submission version 1 text",
            client_submission_id="client-sub-001",
        )
        assert v1["version"] == 1
        assert v1["status"] == "SUBMITTED"
        assert v1["artifact_type"] == "typed_text"
        assert v1["is_late"] is False

        # Version 2: PDF file replacement
        v2 = answer_service.submit_answer(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            file_bytes=VALID_PDF_BYTES,
            filename="solution_v2.pdf",
            content_type="application/pdf",
            client_submission_id="client-sub-002",
        )
        assert v2["version"] == 2
        assert v2["status"] == "SUBMITTED"
        assert v2["artifact_type"] == "pdf_upload"
        assert v2["is_late"] is False

        # Check that v1 is marked REPLACED in projection
        v1_updated = repo.get_answer_by_id(v1["answer_id"])
        assert v1_updated["status"] == "REPLACED"

        # Version 3: PNG diagram replacement
        v3 = answer_service.submit_answer(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            file_bytes=VALID_PNG_BYTES,
            filename="diagram_v3.png",
            content_type="image/png",
            client_submission_id="client-sub-003",
        )
        assert v3["version"] == 3
        assert v3["status"] == "SUBMITTED"
        assert v3["artifact_type"] == "image_upload"

        # Check events emitted
        events = repo.get_participant_events(session_id, participant_id)
        event_types = [e["event_type"] for e in events]
        assert event_types == [
            EventType.ANSWER_SUBMITTED,
            EventType.ANSWER_REPLACED,
            EventType.ANSWER_REPLACED,
        ]

    def test_fourth_submission_version_rejected(
        self, answer_service, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        participant_id = "usr-student-001"

        # Submit 3 versions
        for i in range(1, 4):
            answer_service.submit_answer(
                session_id=session_id,
                tenant_id=tenant_id,
                participant_id=participant_id,
                typed_content=f"Submission {i}",
            )

        # 4th submission is rejected
        with pytest.raises(ValueError, match="Maximum submission versions \\(3\\) reached"):
            answer_service.submit_answer(
                session_id=session_id,
                tenant_id=tenant_id,
                participant_id=participant_id,
                typed_content="Submission 4 - Should Fail",
            )

    def test_idempotency_with_matching_client_submission_id(
        self, answer_service, repo, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        participant_id = "usr-student-001"
        client_id = "deterministic-client-uuid-999"

        # First attempt
        sub1 = answer_service.submit_answer(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            typed_content="Exact identical text payload",
            client_submission_id=client_id,
        )

        # Duplicate retry with same client_id and content
        sub2 = answer_service.submit_answer(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            typed_content="Exact identical text payload",
            client_submission_id=client_id,
        )

        # Must return the identical submission record without creating version 2
        assert sub1["answer_id"] == sub2["answer_id"]
        assert sub2["version"] == 1

        # Must NOT have created additional submission records or events
        answers = repo.get_participant_answers(session_id, participant_id)
        assert len(answers) == 1

        events = repo.get_participant_events(session_id, participant_id)
        assert len(events) == 1

    def test_late_submission_classification(
        self, answer_service, repo, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        participant_id = "usr-student-001"

        # Deadline passed 10 minutes ago
        past_deadline = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()

        late_sub = answer_service.submit_answer(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=participant_id,
            file_bytes=VALID_PDF_BYTES,
            filename="late_exam.pdf",
            deadline_iso=past_deadline,
        )

        assert late_sub["is_late"] is True
        assert late_sub["status"] == "LATE"

        # Check event
        events = repo.get_participant_events(session_id, participant_id)
        assert len(events) == 1
        assert events[0]["event_type"] == EventType.ANSWER_MARKED_LATE
        assert events[0]["payload"]["is_late"] is True
        assert events[0]["payload"]["status"] == "LATE"

    def test_teacher_submissions_review_and_authorization(
        self, answer_service, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        teacher_id = sample_session["teacher_id"]
        unauthorized_teacher = "usr-unassigned-teacher"

        # Submit answers from two students
        answer_service.submit_answer(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id="student-A",
            typed_content="Student A Answer",
        )
        answer_service.submit_answer(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id="student-B",
            typed_content="Student B Answer",
        )

        # Assigned teacher accesses session submissions
        teacher_view = answer_service.list_session_submissions_for_teacher(
            session_id=session_id,
            tenant_id=tenant_id,
            teacher_id=teacher_id,
        )
        assert len(teacher_view) == 2

        # Unauthorized teacher attempt rejected
        with pytest.raises(PermissionError, match="not authorized to view submissions"):
            answer_service.list_session_submissions_for_teacher(
                session_id=session_id,
                tenant_id=tenant_id,
                teacher_id=unauthorized_teacher,
            )

    def test_submission_download_url_role_authorization(
        self, answer_service, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        teacher_id = sample_session["teacher_id"]
        student_id = "usr-student-001"
        other_student_id = "usr-student-002"

        sub = answer_service.submit_answer(
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id=student_id,
            file_bytes=VALID_PDF_BYTES,
            filename="final_paper.pdf",
        )
        answer_id = sub["answer_id"]

        # 1. Submitting student can get download URL
        student_access = answer_service.get_submission_download_url(
            session_id=session_id,
            tenant_id=tenant_id,
            requester_id=student_id,
            requester_role="student",
            answer_id=answer_id,
        )
        assert "download?path=" in student_access["download_url"]
        assert student_access["expires_in_seconds"] == 900

        # 2. Other student is denied
        with pytest.raises(PermissionError, match="Students can only access their own submissions"):
            answer_service.get_submission_download_url(
                session_id=session_id,
                tenant_id=tenant_id,
                requester_id=other_student_id,
                requester_role="student",
                answer_id=answer_id,
            )

        # 3. Assigned teacher is permitted
        teacher_access = answer_service.get_submission_download_url(
            session_id=session_id,
            tenant_id=tenant_id,
            requester_id=teacher_id,
            requester_role="teacher",
            answer_id=answer_id,
        )
        assert "download?path=" in teacher_access["download_url"]

        # 4. Admin is permitted
        admin_access = answer_service.get_submission_download_url(
            session_id=session_id,
            tenant_id=tenant_id,
            requester_id="usr-admin-001",
            requester_role="admin",
            answer_id=answer_id,
        )
        assert "download?path=" in admin_access["download_url"]

    def test_submit_validation_failures(
        self, answer_service, sample_session
    ):
        session_id = sample_session["session_id"]
        tenant_id = sample_session["tenant_id"]
        participant_id = "usr-student-001"

        # Neither typed_content nor file_bytes
        with pytest.raises(ValueError, match="Either typed_content or file_bytes must be provided"):
            answer_service.submit_answer(
                session_id=session_id,
                tenant_id=tenant_id,
                participant_id=participant_id,
            )

        # Invalid file binary magic header
        with pytest.raises(StorageValidationError, match="magic header does not match"):
            answer_service.submit_answer(
                session_id=session_id,
                tenant_id=tenant_id,
                participant_id=participant_id,
                file_bytes=INVALID_BINARY_BYTES,
                filename="fake.pdf",
            )
