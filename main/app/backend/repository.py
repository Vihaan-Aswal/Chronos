"""
Chronos Domain Repository Layer
Encapsulates Supabase data operations with multi-tenant isolation, atomic updates,
session lifecycle invariants, append-only event store, and deterministic projections.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from chronos_logging import get_logger, redact_payload
from projections.engine import ProjectionEngine

logger = get_logger("chronos.repository")


class ChronosDomainRepository:
    """Production & Mock compatible Domain Data Access Layer for W1 and W2."""

    def __init__(self, supabase_client: Any):
        self.db = supabase_client
        self._session_sequences: Dict[str, int] = {}

    # -----------------------------------------------------------------------
    # W1 Tenancy, Sessions & Membership
    # -----------------------------------------------------------------------

    def verify_tenant_membership(
        self, tenant_id: str, user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Check if user has an active membership record in the specified tenant."""
        try:
            res = (
                self.db.table("tenant_members")
                .select("*")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .execute()
            )
            if res.data:
                return res.data[0]
            # Fallback to users table
            res = (
                self.db.table("users")
                .select("*")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .execute()
            )
            return res.data[0] if res.data else None
        except Exception as e:
            logger.warning(f"Error checking tenant membership: {e}")
            return None

    def get_session(
        self, session_id: str, tenant_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Fetch session by ID with optional tenant isolation."""
        try:
            query = self.db.table("sessions").select("*")
            # Support both session_id and id columns
            res = query.eq("session_id", session_id).execute()
            if not res.data:
                res = self.db.table("sessions").select("*").eq("id", session_id).execute()
            if not res.data:
                return None
            session = res.data[0]
            if tenant_id and session.get("tenant_id") and session["tenant_id"] != tenant_id:
                return None
            return session
        except Exception as e:
            logger.warning(f"Error fetching session {session_id}: {e}")
            return None

    def create_session(self, session_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new session in DRAFT or SCHEDULED state."""
        if "session_id" not in session_data and "id" not in session_data:
            session_data["session_id"] = str(uuid.uuid4())
        if "created_at" not in session_data:
            session_data["created_at"] = datetime.now(timezone.utc).isoformat()
        res = self.db.table("sessions").insert(session_data).execute()
        return res.data[0] if res.data else session_data

    def start_session(
        self,
        session_id: str,
        tenant_id: str,
        policy_snapshot: Dict[str, Any],
        started_at: str,
    ) -> Dict[str, Any]:
        """Transition session to ACTIVE and lock policy snapshot."""
        update_data = {
            "status": "ACTIVE",
            "policy_snapshot": policy_snapshot,
            "started_at": started_at,
        }
        res = (
            self.db.table("sessions")
            .update(update_data)
            .eq("session_id", session_id)
            .eq("tenant_id", tenant_id)
            .execute()
        )
        if not res.data:
            # Fallback by id
            res = (
                self.db.table("sessions")
                .update(update_data)
                .eq("id", session_id)
                .eq("tenant_id", tenant_id)
                .execute()
            )
        if not res.data:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")
        return res.data[0]

    def end_session(
        self, session_id: str, tenant_id: str, ended_at: str
    ) -> Dict[str, Any]:
        """Transition session to ENDED state."""
        update_data = {
            "status": "ENDED",
            "ended_at": ended_at,
        }
        res = (
            self.db.table("sessions")
            .update(update_data)
            .eq("session_id", session_id)
            .eq("tenant_id", tenant_id)
            .execute()
        )
        if not res.data:
            res = (
                self.db.table("sessions")
                .update(update_data)
                .eq("id", session_id)
                .eq("tenant_id", tenant_id)
                .execute()
            )
        if not res.data:
            raise ValueError(f"Session '{session_id}' not found in tenant '{tenant_id}'")
        return res.data[0]

    def admit_participant(
        self,
        session_id: str,
        user_id: str,
        tenant_id: str,
        role: str = "student",
        joined_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Record participant admission to session."""
        participant_data = {
            "session_id": session_id,
            "user_id": user_id,
            "tenant_id": tenant_id,
            "role": role,
            "status": "ADMITTED",
            "joined_at": joined_at or datetime.now(timezone.utc).isoformat(),
        }
        res = self.db.table("session_participants").upsert(participant_data).execute()
        return res.data[0] if res.data else participant_data

    def get_session_participant(
        self, session_id: str, user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Fetch participant record for a session."""
        try:
            res = (
                self.db.table("session_participants")
                .select("*")
                .eq("session_id", session_id)
                .eq("user_id", user_id)
                .execute()
            )
            return res.data[0] if res.data else None
        except Exception:
            return None

    def list_teacher_sessions(
        self, teacher_id: str, tenant_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List sessions created by or assigned to a teacher."""
        try:
            query = self.db.table("sessions").select("*").eq("teacher_id", teacher_id)
            if tenant_id:
                query = query.eq("tenant_id", tenant_id)
            res = query.execute()
            return res.data or []
        except Exception:
            return []

    # -----------------------------------------------------------------------
    # W2 Append-Only Event Store & Idempotency
    # -----------------------------------------------------------------------

    def append_event(self, event_envelope: Dict[str, Any]) -> Dict[str, Any]:
        """
        Append a single event to the immutable event log with idempotency guarantee.
        If an event with the same event_id already exists, return the existing record.
        """
        event_id = event_envelope.get("event_id") or str(uuid.uuid4())
        session_id = event_envelope.get("session_id")
        event_envelope["event_id"] = event_id

        # 1. Idempotency check: return existing record if already processed
        existing = self.get_event_by_id(event_id)
        if existing:
            logger.info(f"Duplicate event {event_id} returned idempotently.")
            return existing

        # 2. Server sequence allocation (monotonically increasing per session)
        if "server_sequence" not in event_envelope or event_envelope["server_sequence"] is None:
            curr_seq = self._session_sequences.get(session_id, 0) + 1
            self._session_sequences[session_id] = curr_seq
            event_envelope["server_sequence"] = curr_seq
        else:
            # Track max sequence
            curr_seq = event_envelope["server_sequence"]
            self._session_sequences[session_id] = max(
                self._session_sequences.get(session_id, 0), curr_seq
            )

        if "received_at" not in event_envelope or not event_envelope["received_at"]:
            event_envelope["received_at"] = datetime.now(timezone.utc).isoformat()

        # 3. Privacy Sanitization: redact sensitive items before persistence
        sanitized_payload = redact_payload(event_envelope.get("payload", {}))
        event_envelope["payload"] = sanitized_payload

        # 4. Insert into session_events / events table
        try:
            res = self.db.table("session_events").insert(event_envelope).execute()
        except Exception:
            res = self.db.table("events").insert(event_envelope).execute()

        persisted = res.data[0] if res.data else event_envelope

        # 5. Apply event to incremental projections
        self._apply_event_to_projections(persisted)

        return persisted

    def get_event_by_id(self, event_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve single event by unique event_id for deduplication check."""
        try:
            res = self.db.table("session_events").select("*").eq("event_id", event_id).execute()
            if res.data:
                return res.data[0]
            res = self.db.table("events").select("*").eq("event_id", event_id).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.warning(f"Error fetching event {event_id}: {e}")
            return None

    def get_session_events(
        self,
        session_id: str,
        from_sequence: Optional[int] = None,
        limit: int = 50000,
        is_demo: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        """Query ordered event stream for a session from a given sequence number."""
        try:
            table_name = "session_events"
            query = (
                self.db.table(table_name)
                .select("*")
                .eq("session_id", session_id)
                .order("server_sequence", desc=False)
                .limit(limit)
            )
            if from_sequence is not None:
                query = query.gte("server_sequence", from_sequence)
            if is_demo is not None:
                query = query.eq("is_demo", is_demo)

            res = query.execute()
            if res.data:
                return res.data

            # Fallback to events table
            query2 = (
                self.db.table("events")
                .select("*")
                .eq("session_id", session_id)
                .order("server_sequence", desc=False)
                .limit(limit)
            )
            if from_sequence is not None:
                query2 = query2.gte("server_sequence", from_sequence)
            if is_demo is not None:
                query2 = query2.eq("is_demo", is_demo)
            res2 = query2.execute()
            return res2.data or []
        except Exception as e:
            logger.error(f"Error querying events for session {session_id}: {e}")
            return []

    def get_participant_events(
        self,
        session_id: str,
        participant_id: str,
        event_types: Optional[List[str]] = None,
        from_sequence: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Query participant-filtered event stream in sequence order."""
        try:
            table_name = "session_events"
            query = (
                self.db.table(table_name)
                .select("*")
                .eq("session_id", session_id)
                .eq("participant_id", participant_id)
                .order("server_sequence", desc=False)
            )
            if event_types:
                query = query.in_("event_type", event_types)
            if from_sequence is not None:
                query = query.gte("server_sequence", from_sequence)

            res = query.execute()
            if res.data:
                return res.data

            query2 = (
                self.db.table("events")
                .select("*")
                .eq("session_id", session_id)
                .eq("participant_id", participant_id)
                .order("server_sequence", desc=False)
            )
            if event_types:
                query2 = query2.in_("event_type", event_types)
            if from_sequence is not None:
                query2 = query2.gte("server_sequence", from_sequence)
            res2 = query2.execute()
            return res2.data or []
        except Exception as e:
            logger.error(f"Error querying events for participant {participant_id}: {e}")
            return []

    # -----------------------------------------------------------------------
    # W2 Projections Data Access
    # -----------------------------------------------------------------------

    def upsert_participant_projection(self, projection_data: Dict[str, Any]) -> Dict[str, Any]:
        """Atomically upsert participant state projection."""
        projection_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = self.db.table("participant_projections").upsert(projection_data).execute()
        return res.data[0] if res.data else projection_data

    def get_participant_projection(
        self, session_id: str, participant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Fetch consolidated participant projection."""
        try:
            res = (
                self.db.table("participant_projections")
                .select("*")
                .eq("session_id", session_id)
                .eq("participant_id", participant_id)
                .execute()
            )
            return res.data[0] if res.data else None
        except Exception:
            return None

    def list_session_participant_projections(self, session_id: str) -> List[Dict[str, Any]]:
        """List all current participant projections in a session for teacher dashboard."""
        try:
            res = (
                self.db.table("participant_projections")
                .select("*")
                .eq("session_id", session_id)
                .execute()
            )
            return res.data or []
        except Exception:
            return []

    def record_finalized_window(self, window_data: Dict[str, Any]) -> Dict[str, Any]:
        """Persist a finalized observation window (60s real / 10s demo)."""
        if "window_id" not in window_data:
            window_data["window_id"] = str(uuid.uuid4())
        if "created_at" not in window_data:
            window_data["created_at"] = datetime.now(timezone.utc).isoformat()
        res = self.db.table("finalized_windows").insert(window_data).execute()
        return res.data[0] if res.data else window_data

    def list_finalized_windows(
        self, session_id: str, participant_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Fetch window history for participant or session."""
        try:
            query = self.db.table("finalized_windows").select("*").eq("session_id", session_id)
            if participant_id:
                query = query.eq("participant_id", participant_id)
            res = query.order("window_start", desc=False).execute()
            return res.data or []
        except Exception:
            return []

    def upsert_session_case(self, case_data: Dict[str, Any]) -> Dict[str, Any]:
        """Upsert a grouped triage case."""
        if "case_id" not in case_data:
            case_data["case_id"] = str(uuid.uuid4())
        case_data["last_updated_at"] = datetime.now(timezone.utc).isoformat()
        res = self.db.table("session_cases").upsert(case_data).execute()
        return res.data[0] if res.data else case_data

    def list_session_cases(
        self, session_id: str, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List active or filtered cases for teacher action queue."""
        try:
            query = self.db.table("session_cases").select("*").eq("session_id", session_id)
            if status:
                query = query.eq("status", status)
            res = query.order("priority", desc=True).execute()
            return res.data or []
        except Exception:
            return []

    def upsert_resource_projection(self, resource_data: Dict[str, Any]) -> Dict[str, Any]:
        """Persist or update uploaded or declared external resource."""
        if "resource_id" not in resource_data:
            resource_data["resource_id"] = str(uuid.uuid4())
        res = self.db.table("resource_projections").upsert(resource_data).execute()
        return res.data[0] if res.data else resource_data

    def get_session_resources(self, session_id: str) -> List[Dict[str, Any]]:
        """Fetch all resources declared for a session."""
        try:
            res = self.db.table("resource_projections").select("*").eq("session_id", session_id).execute()
            return res.data or []
        except Exception:
            return []

    def get_resource_by_id(self, resource_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a specific resource by ID."""
        try:
            res = (
                self.db.table("resource_projections")
                .select("*")
                .eq("resource_id", resource_id)
                .execute()
            )
            return res.data[0] if res.data else None
        except Exception:
            return None

    def delete_resource(self, session_id: str, resource_id: str) -> bool:
        """Delete a resource projection record."""
        try:
            res = (
                self.db.table("resource_projections")
                .delete()
                .eq("session_id", session_id)
                .eq("resource_id", resource_id)
                .execute()
            )
            return bool(res.data) if res and res.data else True
        except Exception:
            return False

    def record_answer_projection(self, answer_data: Dict[str, Any]) -> Dict[str, Any]:
        """Persist versioned answer draft or final submission."""
        if "answer_id" not in answer_data:
            answer_data["answer_id"] = str(uuid.uuid4())
        if "submitted_at" not in answer_data:
            answer_data["submitted_at"] = datetime.now(timezone.utc).isoformat()
        res = self.db.table("answer_projections").upsert(answer_data).execute()
        return res.data[0] if res.data else answer_data

    def get_answer_by_id(self, answer_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a specific answer submission by ID."""
        try:
            res = (
                self.db.table("answer_projections")
                .select("*")
                .eq("answer_id", answer_id)
                .execute()
            )
            return res.data[0] if res.data else None
        except Exception:
            return None

    def get_participant_answers(
        self, session_id: str, participant_id: str
    ) -> List[Dict[str, Any]]:
        """Fetch version history of student answers."""
        try:
            res = (
                self.db.table("answer_projections")
                .select("*")
                .eq("session_id", session_id)
                .eq("participant_id", participant_id)
                .order("version", desc=False)
                .execute()
            )
            return res.data or []
        except Exception:
            return []

    def get_session_submissions(self, session_id: str) -> List[Dict[str, Any]]:
        """Fetch all answer submissions for a session across all participants."""
        try:
            res = (
                self.db.table("answer_projections")
                .select("*")
                .eq("session_id", session_id)
                .order("submitted_at", desc=False)
                .execute()
            )
            return res.data or []
        except Exception:
            return []

    def upsert_session_summary(self, summary_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update session summary aggregate metrics."""
        summary_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = self.db.table("session_summaries").upsert(summary_data).execute()
        return res.data[0] if res.data else summary_data

    def upsert_report_read_model(self, report_data: Dict[str, Any]) -> Dict[str, Any]:
        """Materialize comprehensive post-session timeline report."""
        report_data["generated_at"] = datetime.now(timezone.utc).isoformat()
        res = self.db.table("report_read_models").upsert(report_data).execute()
        return res.data[0] if res.data else report_data

    def get_report_read_model(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Fetch materialized report read model."""
        try:
            res = self.db.table("report_read_models").select("*").eq("session_id", session_id).execute()
            return res.data[0] if res.data else None
        except Exception:
            return None

    # -----------------------------------------------------------------------
    # W2 Incremental Projection & Deterministic Rebuild
    # -----------------------------------------------------------------------

    def _apply_event_to_projections(self, event: Dict[str, Any]):
        """Incrementally fold a newly committed event into stored projections."""
        session_id = event.get("session_id")
        participant_id = event.get("participant_id")
        event_type = event.get("event_type")
        payload = event.get("payload") or {}

        if session_id:
            # 1. Resource Published (session-level event)
            if event_type == "RESOURCE_PUBLISHED":
                res_data = {
                    "resource_id": payload.get("resource_id") or str(uuid.uuid4()),
                    "session_id": session_id,
                    "type": payload.get("type") or payload.get("resource_type", "uploaded_pdf"),
                    "title": payload.get("title", "Resource"),
                    "description": payload.get("description"),
                    "storage_path": payload.get("storage_path"),
                    "declared_url": payload.get("declared_url"),
                    "allowed_domain": payload.get("allowed_domain"),
                    "allowed_from": payload.get("allowed_from"),
                    "allowed_until": payload.get("allowed_until"),
                    "required": payload.get("required") if payload.get("required") is not None else payload.get("is_required", False),
                    "is_primary": payload.get("is_primary", False),
                    "immutable_after_start": payload.get("immutable_after_start", True),
                    "content_hash": payload.get("content_hash"),
                    "size_bytes": payload.get("size_bytes") or payload.get("byte_size", 0),
                    "created_by": event.get("actor_id", "teacher"),
                    "created_at": event.get("occurred_at"),
                }
                self.upsert_resource_projection(res_data)

            # 2. Participant specific events
            if participant_id:
                # Update participant projection
                current_proj = self.get_participant_projection(session_id, participant_id)
                if not current_proj:
                    current_proj = {
                        "session_id": session_id,
                        "participant_id": participant_id,
                        "observation_state": "OBSERVABLE",
                        "coverage_ratio": 1.0,
                        "attention_pattern": "UNKNOWN",
                        "identity_state": "NOT_REQUESTED",
                        "active_presence_state": "NOT_REQUESTED",
                        "browser_context": "NO_ACTIVE_EVENT",
                        "case_state": "NONE",
                        "warning_streak": 0,
                        "clean_streak": 0,
                        "active_reason_codes": [],
                        "technical_reasons": [],
                        "student_context_count": 0,
                        "teacher_action_count": 0,
                        "last_event_sequence": 0,
                    }
                updated = ProjectionEngine.reduce_participant_event(current_proj, event)
                self.upsert_participant_projection(updated)

                # Window Finalization table
                if event_type == "WINDOW_FINALIZED":
                    window_data = {
                        "window_id": payload.get("window_id") or str(uuid.uuid4()),
                        "session_id": session_id,
                        "participant_id": participant_id,
                        "window_start": payload.get("window_start") or event.get("occurred_at"),
                        "window_end": payload.get("window_end") or event.get("occurred_at"),
                        "expected_segments": payload.get("expected_segments", 12),
                        "usable_segments": payload.get("usable_segments", 12),
                        "coverage_ratio": payload.get("coverage_ratio", 1.0),
                        "observation_state": payload.get("observation_state", "VALID"),
                        "classification": payload.get("classification", "VALID_CLEAN"),
                        "cue_exposure_seconds": payload.get("cue_exposure_seconds", 0.0),
                        "warning_streak": payload.get("warning_streak", 0),
                        "clean_streak": payload.get("clean_streak", 0),
                        "reason_codes": payload.get("reason_codes", []),
                        "technical_reasons": payload.get("technical_reasons", []),
                        "is_demo": event.get("is_demo", False),
                    }
                    self.record_finalized_window(window_data)

                # Answer Submission
                elif event_type in ("ANSWER_SUBMITTED", "ANSWER_DRAFT_SAVED", "ANSWER_REPLACED", "ANSWER_MARKED_LATE"):
                    ans_data = {
                        "answer_id": payload.get("submission_id") or payload.get("answer_id") or str(uuid.uuid4()),
                        "session_id": session_id,
                        "participant_id": participant_id,
                        "version": payload.get("version", 1),
                        "status": payload.get("status", "SUBMITTED"),
                        "artifact_type": payload.get("artifact_type", "pdf_upload"),
                        "content_hash": payload.get("content_hash"),
                        "byte_size": payload.get("byte_size") or payload.get("size_bytes", 0),
                        "storage_path": payload.get("storage_path"),
                        "client_submission_id": payload.get("client_submission_id"),
                        "submitted_at": payload.get("submitted_at") or event.get("occurred_at"),
                        "is_late": payload.get("is_late", False),
                    }
                    self.record_answer_projection(ans_data)

    def rebuild_projections_for_session(self, session_id: str) -> Dict[str, Any]:
        """
        Reconstruct all participant projections, cases, and summaries by deterministic
        replay of the session's event stream from server_sequence = 1.
        """
        events = self.get_session_events(session_id=session_id, limit=50000)
        logger.info(f"Rebuilding projections for session {session_id} from {len(events)} events.")

        session_record = self.get_session(session_id)
        tenant_id = session_record.get("tenant_id") if session_record else "ten-unknown"

        # Identify all distinct participants in session
        participant_ids = set()
        for evt in events:
            pid = evt.get("participant_id")
            if pid:
                participant_ids.add(pid)

        rebuilt_projections = {}
        for pid in participant_ids:
            proj = ProjectionEngine.build_participant_projection(events, pid, session_id)
            self.upsert_participant_projection(proj)
            rebuilt_projections[pid] = proj

        # Rebuild cases
        rebuilt_cases = ProjectionEngine.build_session_cases(events, session_id)
        for c in rebuilt_cases:
            self.upsert_session_case(c)

        # Rebuild session summary
        summary = ProjectionEngine.build_session_summary(events, session_id, tenant_id)
        self.upsert_session_summary(summary)

        return {
            "session_id": session_id,
            "replayed_events_count": len(events),
            "rebuilt_participants_count": len(participant_ids),
            "rebuilt_cases_count": len(rebuilt_cases),
            "summary": summary,
        }
