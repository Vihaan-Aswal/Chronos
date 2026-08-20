"""
Chronos Short-Lived Single-Use WebSocket Ticket Manager (W1.7)
"""
import secrets
import threading
import time
from dataclasses import dataclass
from typing import Dict, Optional
from fastapi import HTTPException, status
from chronos_logging import get_logger
from auth.context import AuthContext

logger = get_logger("chronos.auth.ws_ticket")


@dataclass(frozen=True)
class WebSocketTicket:
    ticket_id: str
    user_id: str
    tenant_id: str
    session_id: str
    role: str
    channel: str  # "engagement" | "teacher"
    expires_at: float


class WebSocketTicketManager:
    """Thread-safe, single-use ticket generator and validator for secure WebSocket admission."""

    def __init__(self, ticket_ttl_seconds: int = 30):
        self.ticket_ttl = ticket_ttl_seconds
        self._tickets: Dict[str, WebSocketTicket] = {}
        self._lock = threading.Lock()

    def create_ticket(self, auth: AuthContext, session_id: str, channel: str) -> str:
        """Issue a high-entropy, 30s single-use ticket for WebSocket authentication."""
        if channel == "teacher" and not auth.is_teacher:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Only teachers can subscribe to the teacher broadcast channel",
            )

        ticket_id = f"wst_{secrets.token_urlsafe(32)}"
        now = time.time()
        ticket = WebSocketTicket(
            ticket_id=ticket_id,
            user_id=auth.user_id,
            tenant_id=auth.tenant_id,
            session_id=session_id,
            role=auth.role,
            channel=channel,
            expires_at=now + self.ticket_ttl,
        )

        with self._lock:
            self._purge_expired_locked(now)
            self._tickets[ticket_id] = ticket

        logger.info(
            "Created WS admission ticket",
            extra={
                "session_id": session_id,
                "participant_id": auth.user_id,
                "tenant_id": auth.tenant_id,
                "event_type": "WS_TICKET_CREATED",
            },
        )
        return ticket_id

    def consume_ticket(
        self, ticket_id: str, expected_session_id: str, expected_channel: str
    ) -> WebSocketTicket:
        """Validate and immediately delete (consume) the ticket."""
        now = time.time()
        with self._lock:
            ticket = self._tickets.pop(ticket_id, None)

        if not ticket:
            logger.warning(
                "Rejected invalid or already-consumed WS ticket",
                extra={"session_id": expected_session_id, "event_type": "WS_TICKET_REJECTED"},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid, expired, or already used WebSocket admission ticket",
            )

        if ticket.expires_at < now:
            logger.warning(
                "Rejected expired WS ticket",
                extra={"session_id": expected_session_id, "participant_id": ticket.user_id},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="WebSocket admission ticket has expired",
            )

        if ticket.session_id != expected_session_id or ticket.channel != expected_channel:
            logger.warning(
                "Ticket scope mismatch",
                extra={
                    "session_id": expected_session_id,
                    "participant_id": ticket.user_id,
                    "event_type": "WS_SCOPE_MISMATCH",
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ticket scope does not match requested WebSocket channel or session",
            )

        return ticket

    def _purge_expired_locked(self, now: float):
        expired_keys = [k for k, v in self._tickets.items() if v.expires_at < now]
        for k in expired_keys:
            del self._tickets[k]

    def reset(self):
        with self._lock:
            self._tickets.clear()


# Global ticket manager instance
ws_ticket_manager = WebSocketTicketManager()
