"""
Chronos Authentication Context & Domain Models
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional


class UserRole(str, Enum):
    TEACHER = "teacher"
    STUDENT = "student"
    ADMIN = "admin"
    SERVICE_ROLE = "service_role"


class TenantRole(str, Enum):
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT = "student"


class SessionParticipantRole(str, Enum):
    TEACHER = "teacher"
    STUDENT = "student"
    GUEST = "guest"


@dataclass(frozen=True)
class AuthContext:
    """Authenticated subject context extracted strictly from validated credentials."""
    user_id: str
    tenant_id: str
    role: str
    email: Optional[str] = None
    is_service_role: bool = False
    claims: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN.value or self.is_service_role

    @property
    def is_teacher(self) -> bool:
        return self.role == UserRole.TEACHER.value or self.is_admin

    @property
    def is_student(self) -> bool:
        return self.role == UserRole.STUDENT.value
