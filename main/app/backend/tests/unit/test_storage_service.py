"""
Unit Tests for Chronos Storage & Validation Foundation
Workstream: Resource-Supported Assessment Vertical Slice
"""
import hashlib
import os
import time
from pathlib import Path
import pytest
from pydantic import ValidationError

from models import (
    ResourceType,
    ResourceCreateRequest,
    ExternalLinkCreateRequest,
    ResourceResponse,
    ResourceAccessResponse,
    AnswerDraftRequest,
    AnswerSubmitRequest,
    AnswerResponse,
    SubmissionListResponse,
)
from storage import (
    MAX_FILE_SIZE_BYTES,
    DEFAULT_SIGNED_URL_TTL_SECONDS,
    MAGIC_PDF_HEADER,
    MAGIC_PNG_HEADER,
    MAGIC_JPEG_HEADER,
    LocalStorageService,
    SupabaseStorageService,
    StorageError,
    StorageValidationError,
    StorageNotFoundError,
    StorageIntegrityError,
    compute_content_hash,
    inspect_magic_header,
    validate_file_content,
    sanitize_filename,
    generate_resource_storage_path,
    generate_answer_storage_path,
    get_storage_service,
    set_storage_service,
)
from tests.conftest import MockSupabaseClient


# ---------------------------------------------------------------------------
# Synthetic Binary Test Fixtures
# ---------------------------------------------------------------------------

VALID_PDF_BYTES = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
VALID_PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
VALID_JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\xff\xd9"
INVALID_TEXT_BYTES = b"Hello, this is just plain text, not a valid document or image!"
EXECUTABLE_BYTES = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00"


# ---------------------------------------------------------------------------
# 1. Magic Header & Content Validation Tests
# ---------------------------------------------------------------------------

class TestFileValidationAndMagicHeaders:
    """Validates binary magic header inspection, MIME checks, and extension enforcement."""

    def test_valid_pdf_magic_header_detected(self):
        mime, ext = inspect_magic_header(VALID_PDF_BYTES)
        assert mime == "application/pdf"
        assert ext == ".pdf"

    def test_valid_png_magic_header_detected(self):
        mime, ext = inspect_magic_header(VALID_PNG_BYTES)
        assert mime == "image/png"
        assert ext == ".png"

    def test_valid_jpeg_magic_header_detected(self):
        mime, ext = inspect_magic_header(VALID_JPEG_BYTES)
        assert mime == "image/jpeg"
        assert ext == ".jpg"

    def test_invalid_magic_header_raises_validation_error(self):
        with pytest.raises(StorageValidationError, match="magic header does not match"):
            inspect_magic_header(INVALID_TEXT_BYTES)

    def test_empty_content_raises_validation_error(self):
        with pytest.raises(StorageValidationError, match="empty"):
            validate_file_content(b"")

    def test_file_size_exceeding_20mb_raises_validation_error(self):
        oversized_content = MAGIC_PDF_HEADER + (b"\x00" * (MAX_FILE_SIZE_BYTES + 1))
        with pytest.raises(StorageValidationError, match="exceeds maximum allowed limit"):
            validate_file_content(oversized_content)

    def test_file_size_at_exact_limit_passes(self):
        exact_content = MAGIC_PDF_HEADER + (b"\x00" * (MAX_FILE_SIZE_BYTES - len(MAGIC_PDF_HEADER)))
        assert len(exact_content) == MAX_FILE_SIZE_BYTES
        mime, ext = validate_file_content(exact_content, filename="test.pdf")
        assert mime == "application/pdf"

    def test_filename_with_disallowed_extension_rejected(self):
        with pytest.raises(StorageValidationError, match="not permitted"):
            validate_file_content(VALID_PDF_BYTES, filename="test.exe")

    def test_filename_without_extension_rejected(self):
        with pytest.raises(StorageValidationError, match="missing a valid file extension"):
            validate_file_content(VALID_PDF_BYTES, filename="just_filename_no_ext")

    def test_filename_extension_spoofing_mismatch_rejected(self):
        # Sending PNG content disguised as a .pdf file
        with pytest.raises(StorageValidationError, match="Potential file extension spoofing detected"):
            validate_file_content(VALID_PNG_BYTES, filename="paper.pdf")

    def test_declared_mime_type_mismatch_rejected(self):
        # Sending PDF content but declaring image/png
        with pytest.raises(StorageValidationError, match="does not match detected binary magic header"):
            validate_file_content(
                VALID_PDF_BYTES, filename="paper.pdf", content_type="image/png"
            )

    def test_unsupported_mime_type_rejected(self):
        with pytest.raises(StorageValidationError, match="MIME type 'application/zip' is not permitted"):
            validate_file_content(
                VALID_PDF_BYTES, filename="paper.pdf", content_type="application/zip"
            )

    def test_jpeg_alternate_extension_accepted(self):
        mime, ext = validate_file_content(
            VALID_JPEG_BYTES, filename="photo.jpeg", content_type="image/jpeg"
        )
        assert mime == "image/jpeg"
        assert ext == ".jpg"


# ---------------------------------------------------------------------------
# 2. Cryptographic Hash & Path Generation Tests
# ---------------------------------------------------------------------------

class TestHashAndPathGeneration:
    """Verifies SHA-256 deterministic hex hashing and path sanitization invariants."""

    def test_compute_content_hash_deterministic_and_lowercase_hex(self):
        test_bytes = b"%PDF-1.4 Sample Content for Hash Verification"
        expected = hashlib.sha256(test_bytes).hexdigest().lower()
        actual = compute_content_hash(test_bytes)
        assert actual == expected
        assert len(actual) == 64
        assert actual == actual.lower()

    def test_sanitize_filename_prevents_directory_traversal(self):
        malicious = "../../../etc/passwd.pdf"
        sanitized = sanitize_filename(malicious)
        assert ".." not in sanitized
        assert "/" not in sanitized
        assert "\\" not in sanitized
        assert sanitized == "passwd.pdf"

    def test_sanitize_filename_removes_windows_traversal(self):
        malicious = "C:\\Windows\\System32\\..\\exploit.png"
        sanitized = sanitize_filename(malicious)
        assert ":" not in sanitized
        assert "\\" not in sanitized
        assert ".." not in sanitized
        assert "exploit.png" in sanitized

    def test_sanitize_filename_empty_fallback(self):
        assert sanitize_filename("") == "artifact"
        assert sanitize_filename("...") == "artifact"

    def test_generate_resource_storage_path(self):
        session_id = "ses-100"
        resource_id = "res-200"
        filename = "math_quiz_v1.pdf"
        path = generate_resource_storage_path(session_id, resource_id, filename)
        assert path == "sessions/ses-100/resources/res-200_math_quiz_v1.pdf"

    def test_generate_answer_storage_path(self):
        session_id = "ses-100"
        participant_id = "usr-student-001"
        version = 2
        filename = "final_submission.pdf"
        path = generate_answer_storage_path(session_id, participant_id, version, filename)
        assert path == "sessions/ses-100/answers/usr-student-001_2_final_submission.pdf"


# ---------------------------------------------------------------------------
# 3. Local Storage Service Tests
# ---------------------------------------------------------------------------

class TestLocalStorageService:
    """Verifies LocalStorageService upload, download, hash check, signed URLs, and cleanup."""

    @pytest.fixture
    def storage(self):
        return LocalStorageService()

    def test_upload_and_download_roundtrip(self, storage):
        path = "sessions/ses-1/resources/res-1_paper.pdf"
        saved_path = storage.upload_file(path, VALID_PDF_BYTES, content_type="application/pdf")
        assert saved_path == path
        assert storage.exists(path) is True

        downloaded = storage.download_file(path)
        assert downloaded == VALID_PDF_BYTES

    def test_upload_validation_failure_blocks_storage(self, storage):
        path = "sessions/ses-1/resources/res-1_paper.pdf"
        with pytest.raises(StorageValidationError):
            storage.upload_file(path, INVALID_TEXT_BYTES)
        assert storage.exists(path) is False

    def test_download_with_correct_hash_succeeds(self, storage):
        path = "sessions/ses-1/answers/stu-1_1_ans.png"
        storage.upload_file(path, VALID_PNG_BYTES, content_type="image/png")
        correct_hash = compute_content_hash(VALID_PNG_BYTES)

        data = storage.download_file(path, expected_hash=correct_hash)
        assert data == VALID_PNG_BYTES

    def test_download_with_incorrect_hash_raises_integrity_error(self, storage):
        path = "sessions/ses-1/answers/stu-1_1_ans.png"
        storage.upload_file(path, VALID_PNG_BYTES, content_type="image/png")
        tampered_hash = "0" * 64

        with pytest.raises(StorageIntegrityError, match="Integrity check failed"):
            storage.download_file(path, expected_hash=tampered_hash)

    def test_download_nonexistent_file_raises_not_found(self, storage):
        with pytest.raises(StorageNotFoundError, match="not found"):
            storage.download_file("nonexistent/path/doc.pdf")

    def test_delete_file(self, storage):
        path = "sessions/ses-1/resources/res-1_photo.jpg"
        storage.upload_file(path, VALID_JPEG_BYTES, content_type="image/jpeg")
        assert storage.exists(path) is True

        assert storage.delete_file(path) is True
        assert storage.exists(path) is False
        assert storage.delete_file(path) is False

    def test_create_and_verify_signed_url(self, storage):
        path = "sessions/ses-1/resources/res-1_paper.pdf"
        storage.upload_file(path, VALID_PDF_BYTES)

        ttl = 900
        url = storage.create_signed_url(path, expires_in=ttl)
        assert "http://localhost:8000/api/v1/storage/download" in url
        assert "path=" in url
        assert "expires_at=" in url
        assert "signature=" in url

        # Parse query params
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(url)
        params = parse_qs(parsed.query)

        token_path = params["path"][0]
        expires_at = int(params["expires_at"][0])
        signature = params["signature"][0]

        assert storage.verify_signed_url(token_path, expires_at, signature) is True
        # Tampered signature fails
        assert storage.verify_signed_url(token_path, expires_at, "tampered_signature") is False
        # Expired timestamp fails
        assert storage.verify_signed_url(token_path, int(time.time()) - 10, signature) is False

    def test_cleanup_orphan_succeeds(self, storage):
        path = "sessions/ses-1/temp_orphan.pdf"
        storage.upload_file(path, VALID_PDF_BYTES)
        assert storage.exists(path) is True

        cleaned = storage.cleanup_orphan(path)
        assert cleaned is True
        assert storage.exists(path) is False

    def test_local_filesystem_persistence(self, tmp_path):
        fs_storage = LocalStorageService(base_dir=tmp_path)
        path = "sessions/ses-disk/doc.pdf"
        fs_storage.upload_file(path, VALID_PDF_BYTES)

        # File should be physically on disk
        target_file = tmp_path / "sessions" / "ses-disk" / "doc.pdf"
        assert target_file.exists()
        assert target_file.read_bytes() == VALID_PDF_BYTES

        # Download from new instance reading same directory
        reader_storage = LocalStorageService(base_dir=tmp_path)
        assert reader_storage.exists(path) is True
        assert reader_storage.download_file(path) == VALID_PDF_BYTES


# ---------------------------------------------------------------------------
# 4. Supabase Storage Service Tests (with Mock Client)
# ---------------------------------------------------------------------------

class TestSupabaseStorageService:
    """Verifies SupabaseStorageService upload, download, hash check, signed URLs, and cleanup."""

    @pytest.fixture
    def supabase_storage(self, mock_supabase):
        return SupabaseStorageService(supabase_client=mock_supabase, bucket_name="chronos-artifacts")

    def test_upload_and_download_roundtrip(self, supabase_storage):
        path = "sessions/ses-sup-1/resources/paper.pdf"
        saved = supabase_storage.upload_file(path, VALID_PDF_BYTES, content_type="application/pdf")
        assert saved == path
        assert supabase_storage.exists(path) is True

        downloaded = supabase_storage.download_file(path)
        assert downloaded == VALID_PDF_BYTES

    def test_download_hash_verification(self, supabase_storage):
        path = "sessions/ses-sup-1/answers/ans.png"
        supabase_storage.upload_file(path, VALID_PNG_BYTES)
        correct_hash = compute_content_hash(VALID_PNG_BYTES)

        data = supabase_storage.download_file(path, expected_hash=correct_hash)
        assert data == VALID_PNG_BYTES

        with pytest.raises(StorageIntegrityError):
            supabase_storage.download_file(path, expected_hash="bad_hash")

    def test_delete_and_cleanup_orphan(self, supabase_storage):
        path = "sessions/ses-sup-1/orphan.pdf"
        supabase_storage.upload_file(path, VALID_PDF_BYTES)
        assert supabase_storage.exists(path) is True

        assert supabase_storage.cleanup_orphan(path) is True
        assert supabase_storage.exists(path) is False

    def test_create_signed_url(self, supabase_storage):
        path = "sessions/ses-sup-1/resource.pdf"
        supabase_storage.upload_file(path, VALID_PDF_BYTES)

        url = supabase_storage.create_signed_url(path, expires_in=DEFAULT_SIGNED_URL_TTL_SECONDS)
        assert "https://mock-supabase.storage/chronos-artifacts" in url
        assert path in url


# ---------------------------------------------------------------------------
# 5. Domain Models Verification Tests
# ---------------------------------------------------------------------------

class TestStorageDomainModels:
    """Verifies Pydantic request & response models for resources and answers."""

    def test_resource_type_enum_values(self):
        assert ResourceType.UPLOADED_PDF == "uploaded_pdf"
        assert ResourceType.UPLOADED_IMAGE == "uploaded_image"
        assert ResourceType.EXTERNAL_LINK == "external_link"

    def test_resource_create_request_validation(self):
        req = ResourceCreateRequest(
            title="Formula Sheet",
            description="Reference formulas for calculus",
            resource_type=ResourceType.UPLOADED_PDF,
            required=True,
            allowed_from="2026-08-20T10:00:00Z",
            allowed_until="2026-08-20T12:00:00Z",
        )
        assert req.title == "Formula Sheet"
        assert req.resource_type == ResourceType.UPLOADED_PDF
        assert req.required is True

    def test_external_link_create_request_validation(self):
        req = ExternalLinkCreateRequest(
            title="Python Official Docs",
            declared_url="https://docs.python.org/3/",
            allowed_domain="docs.python.org",
            required=False,
        )
        assert req.declared_url == "https://docs.python.org/3/"
        assert req.allowed_domain == "docs.python.org"
        assert req.required is False

    def test_resource_response_serialization(self):
        res = ResourceResponse(
            resource_id="res-001",
            session_id="ses-100",
            type=ResourceType.UPLOADED_PDF,
            title="Exam Paper",
            storage_path="sessions/ses-100/resources/res-001_exam.pdf",
            required=True,
            immutable_after_start=True,
            content_hash=compute_content_hash(VALID_PDF_BYTES),
            size_bytes=len(VALID_PDF_BYTES),
            created_by="teacher-001",
            created_at="2026-08-20T10:00:00Z",
        )
        assert res.resource_id == "res-001"
        assert res.content_hash is not None
        assert res.size_bytes == len(VALID_PDF_BYTES)

    def test_resource_access_response_defaults(self):
        acc = ResourceAccessResponse(
            resource_id="res-001",
            access_url="https://storage.chronos.internal/signed-url-123",
        )
        assert acc.expires_in_seconds == 900

    def test_answer_draft_and_submit_request(self):
        draft = AnswerDraftRequest(typed_content="Draft solution text")
        assert draft.typed_content == "Draft solution text"

        submit = AnswerSubmitRequest(
            typed_content="Final solution text",
            is_final=True,
            client_submission_id="sub-client-123",
        )
        assert submit.is_final is True
        assert submit.client_submission_id == "sub-client-123"

    def test_answer_response_and_submission_list(self):
        ans1 = AnswerResponse(
            answer_id="ans-001",
            session_id="ses-100",
            participant_id="usr-stu-1",
            version=1,
            status="DRAFT",
            artifact_type="typed_text",
            typed_content="Draft 1",
            submitted_at="2026-08-20T10:30:00Z",
            is_late=False,
        )
        ans2 = AnswerResponse(
            answer_id="ans-002",
            session_id="ses-100",
            participant_id="usr-stu-1",
            version=2,
            status="SUBMITTED",
            artifact_type="pdf_upload",
            content_hash=compute_content_hash(VALID_PDF_BYTES),
            byte_size=len(VALID_PDF_BYTES),
            storage_path="sessions/ses-100/answers/usr-stu-1_2_final.pdf",
            submitted_at="2026-08-20T11:00:00Z",
            is_late=False,
        )

        sub_list = SubmissionListResponse(submissions=[ans1, ans2])
        assert len(sub_list.submissions) == 2
        assert len(sub_list.items) == 2
        assert sub_list.submissions[1].status == "SUBMITTED"
        assert sub_list.submissions[1].version == 2
