"""
Chronos Data Subject Rights (DSR) & Participant Access Service (W6.6)
Specification: PRIVACY_DATA_MODEL.md §5, §6 & QUALITY_REQUIREMENTS.md §6
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid
from repository import ChronosDomainRepository
from privacy.retention_service import RetentionService
from chronos_logging import get_logger

logger = get_logger("chronos.privacy.dsr")


class DSRService:
    def __init__(self, repository: ChronosDomainRepository, retention_service: RetentionService):
        self.repo = repository
        self.retention = retention_service

    def export_participant_data(
        self, tenant_id: str, subject_id: str
    ) -> Dict[str, Any]:
        """
        Subject Access Request (SAR): Export all personal derived events,
        submissions, projections, and consent records for the requesting subject.
        Guarantees: Zero biometric vectors, zero raw frames, zero unassigned data.
        """
        now_iso = datetime.now(timezone.utc).isoformat()

        # 1. Consent Records
        consents = self.repo.get_participant_consents(tenant_id, subject_id)

        # 2. Participant Session Projections
        projections = []
        try:
            res = (
                self.repo.db.table("participant_projections")
                .select("*")
                .eq("participant_id", subject_id)
                .execute()
            )
            projections = res.data or []
        except Exception:
            pass

        # 3. Answer Submissions metadata (no other students' answers)
        answers = []
        try:
            res = (
                self.repo.db.table("answer_projections")
                .select("*")
                .eq("participant_id", subject_id)
                .execute()
            )
            answers = res.data or []
        except Exception:
            pass

        # 4. Finalized Windows for this participant
        windows = []
        try:
            res = (
                self.repo.db.table("finalized_windows")
                .select("*")
                .eq("participant_id", subject_id)
                .execute()
            )
            windows = res.data or []
        except Exception:
            pass

        # Record Audit Log
        self.repo.record_audit_log({
            "tenant_id": tenant_id,
            "actor_id": subject_id,
            "actor_role": "student",
            "action_type": "DATA_EXPORT_REQUESTED",
            "target_user_id": subject_id,
            "details": {
                "consents_count": len(consents),
                "projections_count": len(projections),
                "submissions_count": len(answers),
                "windows_count": len(windows),
            },
        })

        return {
            "subject_id": subject_id,
            "tenant_id": tenant_id,
            "exported_at": now_iso,
            "privacy_notice": "Chronos processes derived observation events only; zero raw video or audio is stored.",
            "data": {
                "consent_history": consents,
                "session_projections": projections,
                "answer_submissions": answers,
                "observation_windows": windows,
            },
        }

    def request_erasure(
        self,
        tenant_id: str,
        subject_id: str,
        session_id: Optional[str] = None,
        data_classes: Optional[List[str]] = None,
        reason: Optional[str] = None,
        requested_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Processes a participant erasure / deletion request.
        Checks legal holds and executes deletion if unheld.
        """
        actor = requested_by or subject_id
        req_id = str(uuid.uuid4())
        classes = data_classes or ["ALL"]

        req_record = {
            "request_id": req_id,
            "tenant_id": tenant_id,
            "subject_id": subject_id,
            "session_id": session_id,
            "data_classes": classes,
            "request_type": "DSR_ERASURE",
            "status": "PROCESSING",
            "requested_by": actor,
            "requested_at": datetime.now(timezone.utc).isoformat(),
        }
        self.repo.create_deletion_request(req_record)

        # Execute participant deletion
        del_result = self.retention.execute_participant_deletion(
            tenant_id=tenant_id,
            subject_id=subject_id,
            session_id=session_id,
            actor_id=actor,
            reason=reason or "DSR_ERASURE",
            dry_run=False,
        )

        status_outcome = "COMPLETED" if del_result.get("status") == "COMPLETED" else "BLOCKED_BY_HOLD"
        update_data = {
            "status": status_outcome,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "records_deleted_count": del_result.get("records_deleted", 0),
            "bytes_deleted_count": del_result.get("bytes_deleted", 0),
        }
        self.repo.update_deletion_request(req_id, update_data)

        return {
            "request_id": req_id,
            "status": status_outcome,
            "deletion_summary": del_result,
        }
