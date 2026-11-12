"""
Chronos Legal & Institutional Hold Management Service (W6.4, W6.6)
Specification: PRIVACY_DATA_MODEL.md §2, §6 & QUALITY_REQUIREMENTS.md §6
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid
from repository import ChronosDomainRepository
from chronos_logging import get_logger

logger = get_logger("chronos.privacy.legal_hold")


class LegalHoldService:
    def __init__(self, repository: ChronosDomainRepository):
        self.repo = repository

    def create_hold(
        self,
        tenant_id: str,
        reason: str,
        approver_id: str,
        approver_email: str,
        expiry_or_review_date: str,
        session_id: Optional[str] = None,
        subject_id: Optional[str] = None,
        data_classes: Optional[List[str]] = None,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new legal / institutional hold."""
        classes = data_classes or ["ALL"]
        hold_data = {
            "hold_id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "session_id": session_id,
            "subject_id": subject_id,
            "data_classes": classes,
            "reason": reason,
            "approver_id": approver_id,
            "approver_email": approver_email,
            "notes": notes,
            "status": "ACTIVE",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expiry_or_review_date": expiry_or_review_date,
            "released_at": None,
            "released_by": None,
        }
        persisted = self.repo.create_legal_hold(hold_data)
        logger.info(
            f"Created legal hold: {persisted['hold_id']} (Reason: {reason})",
            extra={
                "event_type": "LEGAL_HOLD_CREATED",
                "tenant_id": tenant_id,
                "session_id": session_id,
                "participant_id": subject_id,
                "outcome": "SUCCESS",
            },
        )
        return persisted

    def get_hold(self, hold_id: str, tenant_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Retrieve a specific hold."""
        return self.repo.get_legal_hold(hold_id, tenant_id)

    def list_holds(
        self,
        tenant_id: str,
        status: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List active or filtered holds for a tenant."""
        return self.repo.list_legal_holds(tenant_id, status=status, session_id=session_id)

    def release_hold(
        self,
        hold_id: str,
        tenant_id: str,
        released_by: str,
        reason: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Release an active hold."""
        released = self.repo.release_legal_hold(
            hold_id=hold_id,
            tenant_id=tenant_id,
            released_by=released_by,
            reason=reason,
        )
        if released:
            logger.info(
                f"Released legal hold: {hold_id}",
                extra={
                    "event_type": "LEGAL_HOLD_RELEASED",
                    "tenant_id": tenant_id,
                    "session_id": released.get("session_id"),
                    "outcome": "SUCCESS",
                },
            )
        return released

    def is_record_held(
        self,
        tenant_id: str,
        session_id: Optional[str] = None,
        subject_id: Optional[str] = None,
        data_class: str = "ALL",
    ) -> bool:
        """Check if target record is protected by an active hold."""
        return self.repo.is_record_held(tenant_id, session_id, subject_id, data_class)
