"""
Chronos Domain Repository Layer
Encapsulates Supabase data operations with multi-tenant isolation, atomic updates,
and session lifecycle invariants.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from chronos_logging import get_logger

logger = get_logger("chronos.repository")


class ChronosDomainRepository:
    """Production & Mock compatible Domain Data Access Layer for W1."""

    def __init__(self, supabase_client: Any):
        self.db = supabase_client

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
