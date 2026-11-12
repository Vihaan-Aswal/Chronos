"""
Chronos Assessment Subsystem - Resource Service
Workstream: Resource-Supported Assessment Vertical Slice

Provides domain logic for publishing, managing, and securing assessment resources:
- Primary question paper upload (max 1 per session).
- Supplementary resource uploads (max 5 per session, PDF/PNG/JPG up to 20MB).
- Declared external link resources (max 5 per session, HTTPS only).
- Session immutability enforcement after start (cannot add/modify/delete in ACTIVE/ENDED/EXPIRED).
- Time-windowed resource availability (allowed_from / allowed_until).
- Signed expiring URLs (15 min / 900s TTL).
- Audit trail event logging (RESOURCE_PUBLISHED, RESOURCE_OPENED, RESOURCE_CLOSED, EXTERNAL_RESOURCE_CLICKED).
- Privacy-preserving external link tracking (destination_known: false).
"""
from __future__ import annotations

import os
import urllib.parse
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
    generate_resource_storage_path,
    get_storage_service,
    validate_file_content,
)

logger = get_logger("chronos.assessment.resource_service")

# Capacity limits
MAX_PRIMARY_QUESTION_PAPERS: int = 1
MAX_SUPPLEMENTARY_RESOURCES: int = 5
MAX_EXTERNAL_LINKS: int = 5


def parse_iso_datetime(iso_str: str) -> datetime:
    """Parses ISO-8601 string to a timezone-aware UTC datetime."""
    clean = iso_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(clean)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class ResourceService:
    """Domain service managing assessment resources and their access rules."""

    def __init__(
        self,
        repository: ChronosDomainRepository,
        storage_service: Optional[StorageService] = None,
    ):
        self.repository = repository
        self.storage_service = storage_service or get_storage_service()

    def publish_uploaded_resource(
        self,
        session_id: str,
        tenant_id: str,
        actor_id: str,
        title: str,
        description: Optional[str] = None,
        file_bytes: bytes = b"",
        filename: str = "",
        content_type: Optional[str] = None,
        is_primary: bool = False,
        required: bool = False,
        allowed_from: Optional[str] = None,
        allowed_until: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Publishes an uploaded artifact (PDF, PNG, JPG) to an assessment session.
        Enforces:
        - Session tenancy and existence.
        - Session immutability (only DRAFT / SCHEDULED sessions permit additions).
        - Capacity bounds (max 1 primary question paper, max 5 supplementary files).
        - Binary magic header, size (<=20MB), and extension validations.
        - SHA-256 cryptographic hashing.
        - Storage upload with automatic orphan cleanup on failure.
        - Durable RESOURCE_PUBLISHED event generation and projection persistence.
        """
        # 1. Tenancy and existence check
        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        # 2. Immutability invariant check
        status = session.get("status", "DRAFT")
        if status in ("ACTIVE", "ENDED", "EXPIRED"):
            raise ValueError(
                f"Cannot add or modify resources after session has started (session status: '{status}')"
            )

        # 3. Capacity limit check
        existing_resources = self.repository.get_session_resources(session_id)
        if is_primary:
            primary_papers = [
                r for r in existing_resources
                if r.get("is_primary") or r.get("type") == "primary_question_paper"
            ]
            if len(primary_papers) >= MAX_PRIMARY_QUESTION_PAPERS:
                raise ValueError(
                    f"A primary question paper is already published for this session (limit {MAX_PRIMARY_QUESTION_PAPERS})"
                )
        else:
            supplementary = [
                r for r in existing_resources
                if not r.get("is_primary") and r.get("type") in ("uploaded_pdf", "uploaded_image", "supplementary")
            ]
            if len(supplementary) >= MAX_SUPPLEMENTARY_RESOURCES:
                raise ValueError(
                    f"Maximum supplementary uploaded resources ({MAX_SUPPLEMENTARY_RESOURCES}) reached for this session"
                )

        # 4. Binary validation & hashing
        detected_mime, canonical_ext = validate_file_content(
            file_bytes, filename=filename, content_type=content_type
        )
        content_hash = compute_content_hash(file_bytes)
        size_bytes = len(file_bytes)

        # 5. Path generation & upload
        resource_id = str(uuid.uuid4())
        storage_path = generate_resource_storage_path(session_id, resource_id, filename)

        try:
            self.storage_service.upload_file(
                storage_path, file_bytes, content_type=detected_mime, validate=False
            )
        except Exception as e:
            logger.error(f"Failed to upload resource artifact to {storage_path}: {e}")
            self.storage_service.cleanup_orphan(storage_path)
            raise

        resource_type = "uploaded_pdf" if canonical_ext == ".pdf" else "uploaded_image"
        created_at = datetime.now(timezone.utc).isoformat()

        # 6. Store projection record
        resource_record = {
            "resource_id": resource_id,
            "session_id": session_id,
            "type": resource_type,
            "title": title,
            "description": description,
            "storage_path": storage_path,
            "declared_url": None,
            "allowed_domain": None,
            "allowed_from": allowed_from,
            "allowed_until": allowed_until,
            "required": required,
            "is_primary": is_primary,
            "immutable_after_start": True,
            "content_hash": content_hash,
            "size_bytes": size_bytes,
            "created_by": actor_id,
            "created_at": created_at,
        }
        self.repository.upsert_resource_projection(resource_record)

        # 7. Durable event emission
        policy_id = session.get("policy_id", PolicyId.RESOURCE_SUPPORTED_ASSESSMENT)
        event_envelope = EventEnvelope.create(
            event_id=str(uuid.uuid4()),
            event_type=EventType.RESOURCE_PUBLISHED,
            tenant_id=tenant_id,
            session_id=session_id,
            actor_id=actor_id,
            actor_role=ActorRole.teacher,
            source=EventSource.teacher,
            occurred_at=created_at,
            policy_id=policy_id,
            payload={
                "resource_id": resource_id,
                "type": resource_type,
                "title": title,
                "description": description,
                "storage_path": storage_path,
                "required": required,
                "is_primary": is_primary,
                "content_hash": content_hash,
                "size_bytes": size_bytes,
                "allowed_from": allowed_from,
                "allowed_until": allowed_until,
                "immutable_after_start": True,
            },
        ).model_dump()
        self.repository.append_event(event_envelope)

        logger.info(f"Published uploaded resource '{resource_id}' ({title}) for session '{session_id}'")
        return resource_record

    def publish_external_link(
        self,
        session_id: str,
        tenant_id: str,
        actor_id: str,
        title: str,
        description: Optional[str] = None,
        declared_url: str = "",
        allowed_domain: Optional[str] = None,
        required: bool = False,
        allowed_from: Optional[str] = None,
        allowed_until: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Publishes a declared external link resource to an assessment session.
        Enforces:
        - Session tenancy and existence.
        - Session immutability (only DRAFT / SCHEDULED sessions permit additions).
        - Strict HTTPS protocol validation.
        - Capacity limit (max 5 external links per session).
        - Durable RESOURCE_PUBLISHED event generation and projection persistence.
        """
        # 1. Tenancy and existence check
        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        # 2. Immutability invariant check
        status = session.get("status", "DRAFT")
        if status in ("ACTIVE", "ENDED", "EXPIRED"):
            raise ValueError(
                f"Cannot add or modify resources after session has started (session status: '{status}')"
            )

        # 3. URL protocol & domain validation
        if not declared_url or not declared_url.startswith("https://"):
            raise ValueError("External link must use HTTPS protocol (e.g. 'https://...')")

        parsed_url = urllib.parse.urlparse(declared_url)
        domain = parsed_url.netloc or parsed_url.hostname or ""
        if not domain:
            raise ValueError(f"Invalid declared URL '{declared_url}': missing domain hostname")

        if allowed_domain:
            if not domain.endswith(allowed_domain) and domain != allowed_domain:
                raise ValueError(
                    f"Declared URL domain '{domain}' does not match specified allowed domain '{allowed_domain}'"
                )
        else:
            allowed_domain = domain

        # 4. Capacity limit check
        existing_resources = self.repository.get_session_resources(session_id)
        external_links = [r for r in existing_resources if r.get("type") == "external_link"]
        if len(external_links) >= MAX_EXTERNAL_LINKS:
            raise ValueError(
                f"Maximum external links ({MAX_EXTERNAL_LINKS}) reached for this session"
            )

        resource_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()

        # 5. Store projection record
        resource_record = {
            "resource_id": resource_id,
            "session_id": session_id,
            "type": "external_link",
            "title": title,
            "description": description,
            "storage_path": None,
            "declared_url": declared_url,
            "allowed_domain": allowed_domain,
            "allowed_from": allowed_from,
            "allowed_until": allowed_until,
            "required": required,
            "is_primary": False,
            "immutable_after_start": True,
            "content_hash": None,
            "size_bytes": 0,
            "created_by": actor_id,
            "created_at": created_at,
        }
        self.repository.upsert_resource_projection(resource_record)

        # 6. Durable event emission
        policy_id = session.get("policy_id", PolicyId.RESOURCE_SUPPORTED_ASSESSMENT)
        event_envelope = EventEnvelope.create(
            event_id=str(uuid.uuid4()),
            event_type=EventType.RESOURCE_PUBLISHED,
            tenant_id=tenant_id,
            session_id=session_id,
            actor_id=actor_id,
            actor_role=ActorRole.teacher,
            source=EventSource.teacher,
            occurred_at=created_at,
            policy_id=policy_id,
            payload={
                "resource_id": resource_id,
                "type": "external_link",
                "title": title,
                "description": description,
                "declared_url": declared_url,
                "allowed_domain": allowed_domain,
                "required": required,
                "is_primary": False,
                "allowed_from": allowed_from,
                "allowed_until": allowed_until,
                "immutable_after_start": True,
            },
        ).model_dump()
        self.repository.append_event(event_envelope)

        logger.info(f"Published external link resource '{resource_id}' ({title}) for session '{session_id}'")
        return resource_record

    def delete_resource(
        self, session_id: str, tenant_id: str, actor_id: str, resource_id: str
    ) -> bool:
        """
        Deletes a resource from a session prior to start.
        Enforces immutability: rejected if session is ACTIVE, ENDED, or EXPIRED.
        """
        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        status = session.get("status", "DRAFT")
        if status in ("ACTIVE", "ENDED", "EXPIRED"):
            raise ValueError(
                f"Cannot delete resources after session has started (session status: '{status}')"
            )

        resource = self.repository.get_resource_by_id(resource_id)
        if not resource or resource.get("session_id") != session_id:
            raise ValueError(f"Resource '{resource_id}' not found in session '{session_id}'")

        if resource.get("storage_path"):
            self.storage_service.delete_file(resource["storage_path"])

        self.repository.delete_resource(session_id, resource_id)
        logger.info(f"Deleted resource '{resource_id}' from session '{session_id}'")
        return True

    def list_session_resources(
        self,
        session_id: str,
        tenant_id: str,
        actor_id: Optional[str] = None,
        actor_role: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Lists all resources associated with a session under tenant isolation."""
        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        return self.repository.get_session_resources(session_id)

    def get_resource_access(
        self, session_id: str, tenant_id: str, participant_id: str, resource_id: str
    ) -> Dict[str, Any]:
        """
        Retrieves secure access details for a declared resource.
        Enforces:
        - Session and tenant validation.
        - Availability window restrictions (allowed_from / allowed_until).
        - Signed expiring URL generation (15 min TTL) for uploaded files.
        - Declared URL delivery for external links.
        """
        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        resource = self.repository.get_resource_by_id(resource_id)
        if not resource or resource.get("session_id") != session_id:
            raise ValueError(f"Resource '{resource_id}' not found in session '{session_id}'")

        # Availability window check
        now = datetime.now(timezone.utc)
        if resource.get("allowed_from"):
            allowed_from_dt = parse_iso_datetime(resource["allowed_from"])
            if now < allowed_from_dt:
                raise PermissionError("Resource is not available at this time (window not yet open)")

        if resource.get("allowed_until"):
            allowed_until_dt = parse_iso_datetime(resource["allowed_until"])
            if now > allowed_until_dt:
                raise PermissionError("Resource is not available at this time (window has expired)")

        if resource.get("storage_path"):
            signed_url = self.storage_service.create_signed_url(
                resource["storage_path"], expires_in=DEFAULT_SIGNED_URL_TTL_SECONDS
            )
            return {
                "resource_id": resource_id,
                "access_url": signed_url,
                "expires_in_seconds": DEFAULT_SIGNED_URL_TTL_SECONDS,
            }
        elif resource.get("declared_url"):
            return {
                "resource_id": resource_id,
                "access_url": resource["declared_url"],
                "expires_in_seconds": 0,
            }
        else:
            return {
                "resource_id": resource_id,
                "access_url": "",
                "expires_in_seconds": 0,
            }

    def record_resource_interaction(
        self,
        session_id: str,
        tenant_id: str,
        participant_id: str,
        resource_id: str,
        event_type: str,
        duration_ms: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Records participant interaction telemetry with a declared resource.
        Supported event types:
        - RESOURCE_OPENED
        - RESOURCE_CLOSED
        - EXTERNAL_RESOURCE_CLICKED
        Enforces privacy invariant: EXTERNAL_RESOURCE_CLICKED must preserve destination_known: false.
        """
        valid_event_types = {"RESOURCE_OPENED", "RESOURCE_CLOSED", "EXTERNAL_RESOURCE_CLICKED"}
        if event_type not in valid_event_types:
            raise ValueError(
                f"Unsupported resource interaction event type '{event_type}'. Allowed: {sorted(list(valid_event_types))}"
            )

        session = self.repository.get_session(session_id, tenant_id=tenant_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")

        resource = self.repository.get_resource_by_id(resource_id)
        resource_title = resource.get("title", "") if resource else ""

        now_iso = datetime.now(timezone.utc).isoformat()

        if event_type == "EXTERNAL_RESOURCE_CLICKED":
            payload = {
                "resource_id": resource_id,
                "declared_resource_opened_recently": True,
                "associated_declared_resource_id": resource_id,
                "destination_known": False,  # INVARIANT: destination_known must be false
                "duration_ms": duration_ms or 0,
                "started_at": now_iso,
            }
        elif event_type == "RESOURCE_OPENED":
            payload = {
                "resource_id": resource_id,
                "title": resource_title,
                "opened_at": now_iso,
            }
        else:  # RESOURCE_CLOSED
            payload = {
                "resource_id": resource_id,
                "title": resource_title,
                "closed_at": now_iso,
                "duration_ms": duration_ms or 0,
            }

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
            payload=payload,
        ).model_dump()

        persisted = self.repository.append_event(event_envelope)
        logger.info(
            f"Recorded {event_type} interaction for participant '{participant_id}' on resource '{resource_id}'"
        )
        return persisted
