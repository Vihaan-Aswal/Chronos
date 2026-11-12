"""
Chronos Authentication and Authorization Package
"""
from auth.context import AuthContext, UserRole, TenantRole, SessionParticipantRole
from auth.jwt_validator import JWTValidator, JWTValidationError
from auth.dependencies import (
    get_auth_context,
    require_role,
    require_teacher,
    require_student,
    require_admin,
)
from auth.ws_ticket import ws_ticket_manager, WebSocketTicket
from auth.rate_limiter import limiter, rate_limit
from auth.meeting_token import MeetingTokenService

__all__ = [
    "AuthContext",
    "UserRole",
    "TenantRole",
    "SessionParticipantRole",
    "JWTValidator",
    "JWTValidationError",
    "get_auth_context",
    "require_role",
    "require_teacher",
    "require_student",
    "require_admin",
    "ws_ticket_manager",
    "WebSocketTicket",
    "limiter",
    "rate_limit",
    "MeetingTokenService",
]
