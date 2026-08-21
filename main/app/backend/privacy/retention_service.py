"""
Chronos Retention & Deletion Engine (W6.4, W6.5, W6.6)
Specification: PRIVACY_DATA_MODEL.md §2, §6 & QUALITY_REQUIREMENTS.md §6
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
import uuid
import hashlib
import hmac
import os
from repository import ChronosDomainRepository
from storage.storage_service import StorageService
from privacy.legal_hold_service import LegalHoldService
from chronos_logging import get_logger

logger = get_logger("chronos.privacy.retention")


def compute_tombstone_hash(tenant_id: str, subject_type: str, identifier: str, pepper: Optional[str] = None) -> str:
    """Computes a tenant-scoped HMAC-SHA256 hash for privacy-safe deletion audit tombstones."""
    secret = pepper or os.getenv("TOMBSTONE_PEPPER_SECRET") or os.getenv("SUPABASE_JWT_SECRET", "chronos-tenant-tombstone-pepper-secret")
    key = f"{tenant_id}:{secret}".encode()
    msg = f"{tenant_id}:{subject_type}:{identifier}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()

# Retention periods in days per PRIVACY_DATA_MODEL.md §2
RETENTION_SCHEDULE_DAYS = {
    "temporary_identity_artifact": 1,        # 24 hours max
    "derived_telemetry": 30,                 # 30 days
    "identity_active_presence_results": 30,  # 30 days
    "uploaded_resources": 90,                # 90 days
    "student_answer_submissions": 90,        # 90 days
    "reports_and_timelines": 90,             # 90 days
    "student_context_appeals": 90,           # 90 days
    "teacher_actions": 180,                  # 180 days
    "security_audit_logs": 180,              # 180 days
    "consent_records": 365,                  # 12 months after withdrawal
}


class RetentionService:
    def __init__(
        self,
        repository: ChronosDomainRepository,
        storage_service: StorageService,
        legal_hold_service: LegalHoldService,
    ):
        self.repo = repository
        self.storage = storage_service
        self.legal_holds = legal_hold_service

    def execute_session_deletion(
        self,
        tenant_id: str,
        session_id: str,
        actor_id: str = "system",
        reason: str = "RETENTION_SCHEDULE_EXPIRY",
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """
        Executes the 7-step deletion workflow for a session.
        Idempotent: running on already-deleted data succeeds cleanly with 0 deleted.
        """
        now = datetime.now(timezone.utc)
        result = {
            "session_id": session_id,
            "tenant_id": tenant_id,
            "dry_run": dry_run,
            "status": "COMPLETED",
            "records_deleted": 0,
            "files_deleted": 0,
            "bytes_deleted": 0,
            "held_items": [],
            "executed_at": now.isoformat(),
        }

        # Step 1 & 2: Check Legal / Institutional Holds
        if self.legal_holds.is_record_held(tenant_id, session_id=session_id, data_class="ALL"):
            result["status"] = "BLOCKED_BY_HOLD"
            result["held_items"].append({
                "session_id": session_id,
                "reason": "Active legal/institutional hold protects this session.",
            })
            logger.info(
                f"Session deletion blocked by legal hold: {session_id}",
                extra={
                    "event_type": "DELETION_BLOCKED_BY_HOLD",
                    "session_id": session_id,
                    "tenant_id": tenant_id,
                    "outcome": "BLOCKED",
                },
            )
            return result

        # Collect artifacts for deletion
        resources = self.repo.get_session_resources(session_id)
        submissions = self.repo.get_session_submissions(session_id)

        # Calculate affected files and bytes
        resource_files = [r for r in resources if r.get("storage_path")]
        submission_files = [s for s in submissions if s.get("storage_path")]

        total_files = len(resource_files) + len(submission_files)
        total_bytes = sum(r.get("size_bytes", 0) or 0 for r in resource_files) + sum(
            s.get("byte_size", 0) or 0 for s in submission_files
        )

        if dry_run:
            result["records_deleted"] = len(resources) + len(submissions)
            result["files_deleted"] = total_files
            result["bytes_deleted"] = total_bytes
            return result

        # Step 3: Delete Stored Storage Artifacts
        for r in resource_files:
            try:
                self.storage.delete_file(r["storage_path"])
                result["files_deleted"] += 1
                result["bytes_deleted"] += r.get("size_bytes", 0) or 0
            except Exception as e:
                logger.debug(f"Storage file delete note: {e}")

        for s in submission_files:
            try:
                self.storage.delete_file(s["storage_path"])
                result["files_deleted"] += 1
                result["bytes_deleted"] += s.get("byte_size", 0) or 0
            except Exception as e:
                logger.debug(f"Storage file delete note: {e}")

        # Step 3 & 4: Purge Database Records across Projections and Events
        purged_db_records = self.repo.purge_session_records(session_id, tenant_id)
        result["records_deleted"] = purged_db_records

        # Step 4: Purge Temporary Identity Artifacts (24h cleanup)
        purged_identities = self.repo.purge_temporary_identity_artifacts(max_age_hours=24)

        # Step 7: Create Minimal Privacy-Safe Deletion Audit Tombstone
        tombstone_data = {
            "tombstone_id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "subject_id_hash": compute_tombstone_hash(tenant_id, "session", session_id),
            "session_id": session_id,
            "request_id": str(uuid.uuid4()),
            "data_classes_deleted": [
                "DERIVED_TELEMETRY",
                "UPLOADED_RESOURCES",
                "STUDENT_ANSWERS",
                "REPORTS_TIMELINES",
            ],
            "records_deleted_count": result["records_deleted"],
            "bytes_deleted_count": result["bytes_deleted"],
            "initiated_by": actor_id,
            "deleted_at": now.isoformat(),
        }
        self.repo.record_deletion_tombstone(tombstone_data)

        logger.info(
            f"Executed session deletion: {session_id} ({result['records_deleted']} records, {result['files_deleted']} files)",
            extra={
                "event_type": "DELETION_EXECUTED",
                "session_id": session_id,
                "tenant_id": tenant_id,
                "outcome": "SUCCESS",
            },
        )
        return result

    def execute_participant_deletion(
        self,
        tenant_id: str,
        subject_id: str,
        session_id: Optional[str] = None,
        actor_id: str = "system",
        reason: str = "DSR_ERASURE_REQUEST",
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """
        Executes Subject Access/Erasure deletion for a single participant.
        When session_id is None, finds all sessions where subject participated and purges across all.
        Idempotent and respects legal holds.
        """
        now = datetime.now(timezone.utc)
        result = {
            "subject_id": subject_id,
            "session_id": session_id,
            "tenant_id": tenant_id,
            "dry_run": dry_run,
            "status": "COMPLETED",
            "records_deleted": 0,
            "files_deleted": 0,
            "bytes_deleted": 0,
            "held_items": [],
            "executed_at": now.isoformat(),
        }

        # Check Legal Holds on subject
        if self.legal_holds.is_record_held(tenant_id, session_id=session_id, subject_id=subject_id, data_class="ALL"):
            result["status"] = "BLOCKED_BY_HOLD"
            result["held_items"].append({
                "subject_id": subject_id,
                "reason": "Active legal/institutional hold protects this subject's records.",
            })
            return result

        # Identify all sessions for this subject
        sessions_to_purge = []
        if session_id:
            sessions_to_purge = [session_id]
        else:
            try:
                part_query = self.repo.db.table("session_participants").select("session_id").eq("user_id", subject_id).execute()
                if part_query.data:
                    sessions_to_purge = list({p["session_id"] for p in part_query.data if p.get("session_id")})
            except Exception as e:
                logger.debug(f"Error querying participant sessions for DSR: {e}")

        # Purge answers and projection records across identified sessions
        for s_id in sessions_to_purge:
            if self.legal_holds.is_record_held(tenant_id, session_id=s_id, subject_id=subject_id, data_class="ALL"):
                result["held_items"].append({
                    "session_id": s_id,
                    "subject_id": subject_id,
                    "reason": "Active legal hold protects records in this session.",
                })
                continue

            answers = self.repo.get_participant_answers(s_id, subject_id)
            answer_files = [a for a in answers if a.get("storage_path")]
            total_files = len(answer_files)
            total_bytes = sum(a.get("byte_size", 0) or 0 for a in answer_files)

            if dry_run:
                result["records_deleted"] += len(answers) + 1
                result["files_deleted"] += total_files
                result["bytes_deleted"] += total_bytes
            else:
                for a in answer_files:
                    try:
                        self.storage.delete_file(a["storage_path"])
                        result["files_deleted"] += 1
                        result["bytes_deleted"] += a.get("byte_size", 0) or 0
                    except Exception as e:
                        logger.debug(f"Participant storage delete note: {e}")

                purged = self.repo.purge_participant_records(s_id, subject_id, tenant_id)
                result["records_deleted"] += purged

        # Purge temporary identity embedding for user
        if not dry_run:
            try:
                self.repo.db.table("identity_embeddings").delete().eq("user_id", subject_id).execute()
                result["records_deleted"] += 1
            except Exception:
                pass
        else:
            result["records_deleted"] += 1

        # Step 7: Tombstone
        if not dry_run:
            tombstone_data = {
                "tombstone_id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "subject_id_hash": compute_tombstone_hash(tenant_id, "subject", subject_id),
                "session_id": session_id,
                "request_id": str(uuid.uuid4()),
                "data_classes_deleted": ["PARTICIPANT_TELEMETRY", "STUDENT_ANSWERS", "IDENTITY_EMBEDDING"],
                "records_deleted_count": result["records_deleted"],
                "bytes_deleted_count": result["bytes_deleted"],
                "initiated_by": actor_id,
                "deleted_at": now.isoformat(),
            }
            self.repo.record_deletion_tombstone(tombstone_data)

        return result

    def run_scheduled_cleanup(
        self,
        tenant_id: Optional[str] = None,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """
        Scans expired sessions and temporary identity artifacts across retention schedules.
        Supports dry-run reporting mode.
        """
        now = datetime.now(timezone.utc)
        summary = {
            "evaluated_at": now.isoformat(),
            "dry_run": dry_run,
            "tenant_id": tenant_id or "all",
            "identity_artifacts_purged": 0,
            "expired_sessions_processed": 0,
            "telemetry_records_purged": 0,
            "audit_logs_purged": 0,
            "consents_purged": 0,
            "total_records_deleted": 0,
            "total_files_deleted": 0,
            "total_bytes_deleted": 0,
            "held_sessions_skipped": 0,
            "details": [],
        }

        # 1. Purge Temporary Identity Artifacts older than 24 hours
        if not dry_run:
            purged_identities = self.repo.purge_temporary_identity_artifacts(max_age_hours=24)
            summary["identity_artifacts_purged"] = purged_identities
            summary["total_records_deleted"] += purged_identities
        else:
            # Dry run count
            threshold = now - timedelta(hours=24)
            res = (
                self.repo.db.table("identity_embeddings")
                .select("*")
                .lt("created_at", threshold.isoformat())
                .execute()
            )
            summary["identity_artifacts_purged"] = len(res.data or [])

        # 2. Check Expired Sessions (ended_at older than 90 days)
        cutoff_90d = (now - timedelta(days=90)).isoformat()
        try:
            query = self.repo.db.table("sessions").select("*").eq("status", "ENDED")
            if tenant_id:
                query = query.eq("tenant_id", tenant_id)
            res = query.lt("ended_at", cutoff_90d).execute()
            expired_sessions = res.data or []
            
            for s in expired_sessions:
                s_id = s.get("session_id") or s.get("id")
                t_id = s.get("tenant_id", "ten-default")
                del_res = self.execute_session_deletion(
                    tenant_id=t_id,
                    session_id=s_id,
                    actor_id="retention_scheduler",
                    reason="SCHEDULED_RETENTION_CLEANUP",
                    dry_run=dry_run,
                )
                summary["details"].append(del_res)
                if del_res.get("status") == "BLOCKED_BY_HOLD":
                    summary["held_sessions_skipped"] += 1
                else:
                    summary["expired_sessions_processed"] += 1
                    summary["total_records_deleted"] += del_res.get("records_deleted", 0)
                    summary["total_files_deleted"] += del_res.get("files_deleted", 0)
                    summary["total_bytes_deleted"] += del_res.get("bytes_deleted", 0)
        except Exception as e:
            logger.warning(f"Error in scheduled retention scan: {e}")

        # 3. Purge 30-day raw observation telemetry
        if not dry_run:
            purged_telemetry = self.repo.purge_telemetry_older_than(max_age_days=30)
            summary["telemetry_records_purged"] = purged_telemetry
            summary["total_records_deleted"] += purged_telemetry

            # 4. Purge 180-day audit logs
            purged_audit = self.repo.purge_audit_logs_older_than(max_age_days=180)
            summary["audit_logs_purged"] = purged_audit
            summary["total_records_deleted"] += purged_audit

            # 5. Purge 365-day withdrawn consent records
            purged_consents = self.repo.purge_consents_older_than(max_age_days=365)
            summary["consents_purged"] = purged_consents
            summary["total_records_deleted"] += purged_consents

        return summary
