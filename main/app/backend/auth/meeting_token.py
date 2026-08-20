"""
Chronos Meeting Provider (100ms) Server-Authoritative Token Generator (W1.6)
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import jwt
from fastapi import HTTPException, status
from chronos_logging import get_logger
from auth.context import AuthContext, SessionParticipantRole

logger = get_logger("chronos.auth.meeting_token")


class MeetingTokenService:
    def __init__(self, db_client: Any):
        self.db = db_client
        self.access_key = os.getenv("HMS_ACCESS_KEY", "mock_hms_access")
        self.secret = os.getenv("HMS_SECRET", "mock_test_hms_secret_32_characters_long")
        self.default_room_id = os.getenv("HMS_ROOM_ID", "mock_room_default")
        _ttl_raw = os.getenv("HMS_TOKEN_TTL_MINUTES", "120")
        try:
            self.ttl_minutes = int(_ttl_raw)
        except ValueError:
            self.ttl_minutes = 120

    def generate_session_meeting_token(
        self, session_id: str, auth: AuthContext
    ) -> Dict[str, Any]:
        """Verify session eligibility and issue a server-authoritative HMS JWT."""
        # 1. Fetch and verify session
        session_res = self.db.table("sessions").select("*").eq("session_id", session_id).execute()
        if not session_res.data:
            # Fallback check if stored by "id" instead of "session_id"
            session_res = self.db.table("sessions").select("*").eq("id", session_id).execute()

        if not session_res.data:
            # If session is the legacy "default-session" in dev/mock, allow if single-tenant
            if session_id == "default-session" and (os.getenv("ENV") == "test" or os.getenv("ALLOW_DEFAULT_SESSION") == "1"):
                resolved_role = SessionParticipantRole.TEACHER.value if auth.is_teacher else SessionParticipantRole.STUDENT.value
                room_id = self.default_room_id
                return self._mint_jwt(auth.user_id, resolved_role, room_id, session_id, auth.tenant_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session '{session_id}' not found",
            )

        session = session_res.data[0]

        # 2. Verify Tenant Isolation (Safe Denial)
        session_tenant = session.get("tenant_id")
        if session_tenant and session_tenant != auth.tenant_id and not auth.is_service_role:
            logger.warning(
                "Cross-tenant meeting token access attempt denied",
                extra={
                    "event_type": "CROSS_TENANT_ACCESS_DENIED",
                    "outcome": "DENIED",
                    "session_id": session_id,
                    "participant_id": auth.user_id,
                    "tenant_id": auth.tenant_id,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session '{session_id}' not found",
            )

        # 3. Check Session Lifecycle Status
        status_val = session.get("status", "ACTIVE")
        if status_val in ("ENDED", "EXPIRED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot issue meeting token for session in '{status_val}' state",
            )

        # Check expiration timestamp if present
        expires_at_str = session.get("expires_at")
        if expires_at_str:
            try:
                exp_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                if datetime.now(timezone.utc) >= exp_dt:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Session has expired",
                    )
            except (ValueError, TypeError):
                pass

        # 4. Server-Side Role & Membership Resolution
        teacher_id = session.get("teacher_id")
        if teacher_id == auth.user_id or auth.is_admin:
            resolved_role = SessionParticipantRole.TEACHER.value
        else:
            # Check participant membership
            part_res = (
                self.db.table("session_participants")
                .select("*")
                .eq("session_id", session_id)
                .eq("user_id", auth.user_id)
                .execute()
            )
            if not part_res.data:
                # Check tenant membership - if valid student in tenant, allow join
                member_res = (
                    self.db.table("tenant_members")
                    .select("*")
                    .eq("tenant_id", auth.tenant_id)
                    .eq("user_id", auth.user_id)
                    .execute()
                )
                if not member_res.data:
                    # Also check legacy users table
                    user_res = (
                        self.db.table("users")
                        .select("*")
                        .eq("user_id", auth.user_id)
                        .execute()
                    )
                    if user_res.data and user_res.data[0].get("tenant_id") == session_tenant:
                        resolved_role = SessionParticipantRole.STUDENT.value
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied: User is not an eligible participant for this session",
                        )
                else:
                    resolved_role = SessionParticipantRole.STUDENT.value
            else:
                participant = part_res.data[0]
                if participant.get("status") in ("BLOCKED", "REMOVED", "DECLINED"):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Access denied: Participant status is '{participant.get('status')}'",
                    )
                resolved_role = participant.get("role", SessionParticipantRole.STUDENT.value)

        room_id = session.get("room_id") or session.get("hms_room_id") or self.default_room_id
        return self._mint_jwt(auth.user_id, resolved_role, room_id, session_id, auth.tenant_id)

    def _mint_jwt(
        self, user_id: str, role: str, room_id: str, session_id: str, tenant_id: str
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        ttl = max(self.ttl_minutes, 5)
        exp = now + timedelta(minutes=ttl)

        payload = {
            "access_key": self.access_key,
            "room_id": room_id,
            "user_id": user_id,
            "role": role,
            "type": "app",
            "version": 2,
            "jti": str(uuid.uuid4()),
            "iat": int(now.timestamp()),
            "nbf": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        }

        token = jwt.encode(payload, self.secret, algorithm="HS256")

        logger.info(
            "Issued session meeting token",
            extra={
                "event_type": "MEETING_TOKEN_ISSUED",
                "session_id": session_id,
                "participant_id": user_id,
                "tenant_id": tenant_id,
                "outcome": "SUCCESS",
            },
        )

        return {
            "token": token,
            "room_id": room_id,
            "role": role,
            "expires_at": exp.isoformat(),
        }
