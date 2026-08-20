"""
Chronos Granular Consent Management Service (W6.2, W6.3)
Specification: PRIVACY_DATA_MODEL.md §4 & QUALITY_REQUIREMENTS.md §6
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid
from contracts import ConsentCategory
from repository import ChronosDomainRepository
from chronos_logging import get_logger

logger = get_logger("chronos.privacy.consent")

ALL_CONSENT_SCOPES = [
    ConsentCategory.LIVE_SESSION_PARTICIPATION.value,
    ConsentCategory.CAMERA_LOCAL_PROCESSING.value,
    ConsentCategory.IDENTITY_ENROLLMENT.value,
    ConsentCategory.IDENTITY_VERIFICATION.value,
    ConsentCategory.ACTIVE_PRESENCE_CHECKS.value,
    ConsentCategory.ATTENTION_TELEMETRY.value,
    ConsentCategory.BROWSER_CONTEXT_TELEMETRY.value,
    ConsentCategory.ANSWER_STORAGE.value,
]


class ConsentService:
    def __init__(self, repository: ChronosDomainRepository):
        self.repo = repository

    def record_consent_grant(
        self,
        tenant_id: str,
        subject_id: str,
        scope: str,
        grant: bool = True,
        session_id: Optional[str] = None,
        policy_version: str = "v1",
        actor_type: str = "student",
    ) -> Dict[str, Any]:
        """Record or update a single granular consent choice."""
        now_iso = datetime.now(timezone.utc).isoformat()
        consent_record = {
            "consent_id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "subject_id": subject_id,
            "session_id": session_id,
            "scope": scope,
            "policy_version": policy_version,
            "grant_or_decline": "GRANT" if grant else "DECLINE",
            "granted_at": now_iso,
            "withdrawn_at": None if grant else now_iso,
            "actor_type": actor_type,
            "created_at": now_iso,
        }
        persisted = self.repo.record_consent(consent_record)
        logger.info(
            f"Recorded consent choice: {scope} -> {'GRANT' if grant else 'DECLINE'}",
            extra={
                "event_type": "CONSENT_RECORDED",
                "tenant_id": tenant_id,
                "session_id": session_id,
                "participant_id": subject_id,
                "outcome": "SUCCESS",
            },
        )
        return persisted

    def record_batch_consent_grants(
        self,
        tenant_id: str,
        subject_id: str,
        scopes: Dict[str, bool],
        session_id: Optional[str] = None,
        policy_version: str = "v1",
        actor_type: str = "student",
    ) -> List[Dict[str, Any]]:
        """Record multiple granular consent choices at once (e.g. from Pre-Join notice)."""
        results = []
        for scope, grant in scopes.items():
            res = self.record_consent_grant(
                tenant_id=tenant_id,
                subject_id=subject_id,
                scope=scope,
                grant=grant,
                session_id=session_id,
                policy_version=policy_version,
                actor_type=actor_type,
            )
            results.append(res)
        return results

    def withdraw_consent(
        self,
        tenant_id: str,
        subject_id: str,
        scope: str,
        session_id: Optional[str] = None,
        policy_version: str = "v1",
    ) -> Optional[Dict[str, Any]]:
        """Withdraw consent for an optional category mid-session."""
        withdrawn = self.repo.withdraw_consent(
            tenant_id=tenant_id,
            subject_id=subject_id,
            scope=scope,
            session_id=session_id,
        )
        logger.info(
            f"Consent withdrawn for scope: {scope}",
            extra={
                "event_type": "CONSENT_WITHDRAWN",
                "tenant_id": tenant_id,
                "session_id": session_id,
                "participant_id": subject_id,
                "outcome": "SUCCESS",
            },
        )
        return withdrawn

    def is_scope_granted(
        self,
        tenant_id: str,
        subject_id: str,
        scope: str,
        session_id: Optional[str] = None,
    ) -> bool:
        """
        Check if a specific scope is currently granted.
        Returns True if explicitly granted; False if declined, withdrawn, or missing.
        """
        record = self.repo.get_consent_status(tenant_id, subject_id, scope, session_id)
        if not record:
            return False
        return (
            record.get("grant_or_decline") == "GRANT"
            and record.get("withdrawn_at") is None
        )

    def list_participant_consents(
        self, tenant_id: str, subject_id: str, session_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Fetch full consent records list for participant."""
        return self.repo.get_participant_consents(tenant_id, subject_id, session_id)
