"""
Chronos FastAPI Authorization Guards & Dependencies
"""
from typing import List, Optional
from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from auth.context import AuthContext, UserRole
from auth.jwt_validator import JWTValidator

security_bearer = HTTPBearer(auto_error=False)
_validator_instance: Optional[JWTValidator] = None


def get_jwt_validator() -> JWTValidator:
    global _validator_instance
    if _validator_instance is None:
        _validator_instance = JWTValidator()
    return _validator_instance


def set_jwt_validator(validator: JWTValidator):
    global _validator_instance
    _validator_instance = validator


async def get_auth_context(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
) -> AuthContext:
    """Extract and validate AuthContext from HTTP Authorization Bearer header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = auth_header.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format. Expected 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1]
    validator = get_jwt_validator()
    return validator.decode_and_validate(token)


async def get_optional_auth_context(
    request: Request,
) -> Optional[AuthContext]:
    """Optional auth context extractor that returns None if no header is present."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    parts = auth_header.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    try:
        validator = get_jwt_validator()
        return validator.decode_and_validate(parts[1])
    except Exception:
        return None


def require_role(allowed_roles: List[str]):
    """Enforce role-based access control guard."""
    async def role_checker(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if auth.is_service_role:
            return auth
        if auth.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Operation requires one of roles {allowed_roles}, but caller has role '{auth.role}'",
            )
        return auth
    return role_checker


# Canonical role dependency helpers
require_teacher = require_role([UserRole.TEACHER.value, UserRole.ADMIN.value])
require_student = require_role([UserRole.STUDENT.value])
require_admin = require_role([UserRole.ADMIN.value])
