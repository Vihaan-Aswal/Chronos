"""
Chronos Assessment Subsystem - Answer Service
Workstream: Resource-Supported Assessment Vertical Slice

Provides domain logic for student answer workflows:
- Unversioned or draft answer auto-saving (ANSWER_DRAFT_SAVED).
- Versioned final submissions (up to 3 versions per participant, version progression 1 -> 2 -> 3).
- Enforcement of max 3 submissions (rejection of 4th version).
- Idempotency with client_submission_id & content hash matching.
- Deadline tracking and late submission classification (status="LATE", ANSWER_MARKED_LATE).
- Artifact validation (PDF/PNG/JPG up to 20MB, magic header checks).
- Role-based authorization for submission review and signed expiring download URLs.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from chronos_logging import get_logger
from contracts import ActorRole, EventEnvelope, EventSource, EventType, PolicyId
from repository import ChronosDomainRepository
from storage.storage_service import (
    DEFAULT_SIGNED_URL_TTL_SECONDS,
    MAX_FILE_SIZE_BYTES,
    StorageService,
    StorageValidationError,
    compute_content_hash,
    generate_answer_storage_path,
    get_storage_service,
    validate_file_content,
)

logger = get_logger("chronos.assessment.answer_service")

MAX_SUBMISSION_VERSIONS: int = 3


def parse_iso_datetime(iso_str: str) -> datetime:
    """Parses ISO-8601 string to a timezone-aware UTC datetime."""
    clean = iso_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(clean)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class AnswerService:
    """Domain service managing student answer drafts, submissions, versions, and retrieval."""

    def __init__(
        self,
        repository: ChronosDomainRepository,
        storage_service: Optional[StorageService] = None,
    ):
        self.repository = repository
        self.storage_service = storage_service or get_storage_service()

    def save_draft(
        self,
        session_id: str,
        tenant_id: str,
        participant_id: str,
        typed_content: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Saves an auto-saved draft of typed answer text.
        Enforces:
        - Session tenancy and existence.
        - Session status must not be ENDED or EXPIRED.
        - Computes SHA-256 hash and byte size.
        - Emits durable ANSWER_DRAFT_SAVED event.
        - Does not consume student's submitted version quota.
        """
        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        status = session.get("status", "DRAFT")
        if status in ("ENDED", "EXPIRED"):
            raise ValueError(
                f"Cannot save draft for session in '{status}' status"
            )

        content_str = typed_content or ""
        content_bytes = content_str.encode("utf-8")
        content_hash = compute_content_hash(content_bytes)
        byte_size = len(content_bytes)
        now_iso = datetime.now(timezone.utc).isoformat()
        draft_id = str(uuid.uuid4())

        draft_record = {
            "answer_id": draft_id,
            "session_id": session_id,
            "participant_id": participant_id,
            "version": 0,
            "status": "DRAFT",
            "artifact_type": "typed_text",
            "content_hash": content_hash,
            "byte_size": byte_size,
            "storage_path": None,
            "typed_content": content_str,
            "submitted_at": now_iso,
            "is_late": False,
        }
        self.repository.record_answer_projection(draft_record)

        policy_id = session.get("policy_id", PolicyId.RESOURCE_SUPPORTED_ASSESSMENT)
        event_envelope = EventEnvelope.create(
            event_id=str(uuid.uuid4()),
            event_type=EventType.ANSWER_DRAFT_SAVED,
            tenant_id=tenant_id,
            session_id=session_id,
            participant_id=participant_id,
            actor_id=participant_id,
            actor_role=ActorRole.participant,
            source=EventSource.browser,
            occurred_at=now_iso,
            policy_id=policy_id,
            payload={
                "submission_id": draft_id,
                "version": 0,
                "status": "DRAFT",
                "artifact_type": "typed_text",
                "content_hash": content_hash,
                "byte_size": byte_size,
                "is_late": False,
                "submitted_at": now_iso,
            },
        ).model_dump()
        self.repository.append_event(event_envelope)

        logger.info(
            f"Saved answer draft for participant '{participant_id}' in session '{session_id}'"
        )
        return draft_record

    def submit_answer(
        self,
        session_id: str,
        tenant_id: str,
        participant_id: str,
        typed_content: Optional[str] = None,
        file_bytes: Optional[bytes] = None,
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
        client_submission_id: Optional[str] = None,
        deadline_iso: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Submits an answer artifact (file or typed text) as a versioned submission.
        Enforces:
        - Session tenancy, existence, and active state (rejected if ENDED/EXPIRED).
        - Idempotency with client_submission_id & matching content hash.
        - Maximum 3 submitted versions per participant (rejecting 4th version with ValueError).
        - Automatic version increment (1 -> 2 -> 3).
        - Deadline evaluation (marks is_late=True, status="LATE", ANSWER_MARKED_LATE if past deadline).
        - Replacement tracking (earlier SUBMITTED version marked REPLACED).
        - Artifact validation and secure storage path generation.
        - Durable event emission (ANSWER_SUBMITTED / ANSWER_REPLACED / ANSWER_MARKED_LATE).
        """
        # 1. Tenancy and existence check
        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        # 2. Session state check
        session_status = session.get("status", "DRAFT")
        if session_status in ("ENDED", "EXPIRED"):
            raise ValueError(
                f"Cannot submit answer for session with status '{session_status}'"
            )

        # 3. Artifact payload validation
        if typed_content is None and file_bytes is None:
            raise ValueError("Either typed_content or file_bytes must be provided for submission")

        if file_bytes is not None:
            detected_mime, canonical_ext = validate_file_content(
                file_bytes, filename=filename, content_type=content_type
            )
            content_hash = compute_content_hash(file_bytes)
            byte_size = len(file_bytes)
            artifact_type = "pdf_upload" if canonical_ext == ".pdf" else "image_upload"
        else:
            content_str = typed_content or ""
            content_bytes = content_str.encode("utf-8")
            content_hash = compute_content_hash(content_bytes)
            byte_size = len(content_bytes)
            artifact_type = "typed_text"
            canonical_ext = ".txt"
            detected_mime = "text/plain"

        # 4. Fetch submission history for idempotency and version counting
        all_answers = self.repository.get_participant_answers(session_id, participant_id)
        submitted_versions = [
            a for a in all_answers
            if a.get("status") in ("SUBMITTED", "REPLACED", "LATE") and (a.get("version") or 0) >= 1
        ]

        # 5. Idempotency verification
        if client_submission_id:
            for existing in submitted_versions:
                if (
                    existing.get("client_submission_id") == client_submission_id
                    and existing.get("content_hash") == content_hash
                ):
                    logger.info(
                        f"Idempotent submission match for client_id '{client_submission_id}'. Returning existing record."
                    )
                    return existing

        # 6. Version capacity check (max 3 versions)
        if len(submitted_versions) >= MAX_SUBMISSION_VERSIONS:
            raise ValueError(f"Maximum submission versions ({MAX_SUBMISSION_VERSIONS}) reached")

        next_version = len(submitted_versions) + 1

        # 7. Deadline evaluation
        now = datetime.now(timezone.utc)
        is_late = False

        if deadline_iso:
            try:
                deadline_dt = parse_iso_datetime(deadline_iso)
                if now > deadline_dt:
                    is_late = True
            except Exception as e:
                logger.warning(f"Error parsing deadline_iso '{deadline_iso}': {e}")

        if not is_late and session.get("expires_at"):
            try:
                exp_dt = parse_iso_datetime(session["expires_at"])
                if now > exp_dt:
                    is_late = True
            except Exception as e:
                logger.warning(f"Error parsing session expires_at: {e}")

        if is_late:
            sub_status = "LATE"
            event_type = EventType.ANSWER_MARKED_LATE
        elif next_version > 1:
            sub_status = "SUBMITTED"
            event_type = EventType.ANSWER_REPLACED
        else:
            sub_status = "SUBMITTED"
            event_type = EventType.ANSWER_SUBMITTED

        # 8. Mark previous SUBMITTED versions as REPLACED
        if next_version > 1:
            for prev in submitted_versions:
                if prev.get("status") == "SUBMITTED":
                    prev["status"] = "REPLACED"
                    self.repository.record_answer_projection(prev)

        # 9. Upload artifact if binary file
        submission_id = str(uuid.uuid4())
        storage_path = None

        if file_bytes is not None:
            actual_filename = filename or f"answer_v{next_version}{canonical_ext}"
            storage_path = generate_answer_storage_path(
                session_id, participant_id, next_version, actual_filename
            )
            try:
                self.storage_service.upload_file(
                    storage_path, file_bytes, content_type=detected_mime, validate=False
                )
            except Exception as e:
                logger.error(f"Failed to upload submission artifact to {storage_path}: {e}")
                self.storage_service.cleanup_orphan(storage_path)
                raise

        now_iso = now.isoformat()

        # 10. Persist answer projection
        submission_record = {
            "answer_id": submission_id,
            "session_id": session_id,
            "participant_id": participant_id,
            "version": next_version,
            "status": sub_status,
            "artifact_type": artifact_type,
            "content_hash": content_hash,
            "byte_size": byte_size,
            "storage_path": storage_path,
            "typed_content": typed_content if file_bytes is None else None,
            "client_submission_id": client_submission_id,
            "submitted_at": now_iso,
            "is_late": is_late,
        }
        self.repository.record_answer_projection(submission_record)

        # 11. Emit durable event
        policy_id = session.get("policy_id", PolicyId.RESOURCE_SUPPORTED_ASSESSMENT)
        event_envelope = EventEnvelope.create(
            event_id=str(uuid.uuid4()),
            event_type=event_type,
            tenant_id=tenant_id,
            session_id=session_id,
            participant_id=participant_id,
            actor_id=participant_id,
            actor_role=ActorRole.participant,
            source=EventSource.browser,
            occurred_at=now_iso,
            policy_id=policy_id,
            payload={
                "submission_id": submission_id,
                "version": next_version,
                "status": sub_status,
                "artifact_type": artifact_type,
                "content_hash": content_hash,
                "byte_size": byte_size,
                "storage_path": storage_path,
                "is_late": is_late,
                "client_submission_id": client_submission_id,
                "submitted_at": now_iso,
            },
        ).model_dump()
        self.repository.append_event(event_envelope)

        logger.info(
            f"Recorded submission v{next_version} ({sub_status}) for participant '{participant_id}' in session '{session_id}'"
        )
        return submission_record

    def list_student_submissions(
        self, session_id: str, tenant_id: str, participant_id: str
    ) -> List[Dict[str, Any]]:
        """Retrieves full submission version history for a specific student."""
        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        return self.repository.get_participant_answers(session_id, participant_id)

    def list_session_submissions_for_teacher(
        self, session_id: str, tenant_id: str, teacher_id: str
    ) -> List[Dict[str, Any]]:
        """
        Retrieves all student submissions for a session, checking teacher authorization.
        """
        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        # Authorization check
        if session.get("teacher_id") != teacher_id:
            member = self.repository.verify_tenant_membership(tenant_id, teacher_id)
            if not member or member.get("role") not in ("teacher", "admin"):
                raise PermissionError(
                    f"Teacher '{teacher_id}' is not authorized to view submissions for session '{session_id}'"
                )

        return self.repository.get_session_submissions(session_id)

    def get_submission_download_url(
        self,
        session_id: str,
        tenant_id: str,
        requester_id: str,
        requester_role: str,
        answer_id: str,
    ) -> Dict[str, Any]:
        """
        Generates a secure, signed download URL for an answer submission artifact.
        Enforces:
        - Students can only access their own submissions.
        - Teachers can access submissions if assigned to the session or tenant admin.
        - Default signed URL TTL: 15 minutes (900 seconds).
        """
        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        answer = self.repository.get_answer_by_id(answer_id)
        if not answer or answer.get("session_id") != session_id:
            raise ValueError(f"Submission '{answer_id}' not found in session '{session_id}'")

        # Authorization check
        role_lower = str(requester_role).lower()
        if role_lower in ("student", "participant"):
            if answer.get("participant_id") != requester_id:
                raise PermissionError("Students can only access their own submissions")
        elif role_lower == "teacher":
            if session.get("teacher_id") != requester_id:
                member = self.repository.verify_tenant_membership(tenant_id, requester_id)
                if not member or member.get("role") not in ("teacher", "admin"):
                    raise PermissionError("Teacher not authorized for this session")
        elif role_lower == "admin":
            pass  # Admins permitted
        else:
            raise PermissionError(f"Unauthorized requester role: '{requester_role}'")

        if answer.get("storage_path"):
            signed_url = self.storage_service.create_signed_url(
                answer["storage_path"], expires_in=DEFAULT_SIGNED_URL_TTL_SECONDS
            )
            return {
                "answer_id": answer_id,
                "download_url": signed_url,
                "expires_in_seconds": DEFAULT_SIGNED_URL_TTL_SECONDS,
            }
        elif answer.get("typed_content"):
            return {
                "answer_id": answer_id,
                "download_url": None,
                "typed_content": answer["typed_content"],
                "expires_in_seconds": 0,
            }
        else:
            return {
                "answer_id": answer_id,
                "download_url": None,
                "expires_in_seconds": 0,
            }
