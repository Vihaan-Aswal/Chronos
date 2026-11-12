"""
Chronos JWT Validator - Supabase Bearer Token & Test Verification
"""
import os
import time
from typing import Any, Dict, Optional
import jwt
from fastapi import HTTPException, status
from chronos_logging import get_logger
from auth.context import AuthContext, UserRole

logger = get_logger("chronos.auth.jwt")


class JWTValidationError(HTTPException):
    def __init__(self, detail: str, status_code: int = status.HTTP_401_UNAUTHORIZED):
        super().__init__(
            status_code=status_code,
            detail=detail,
            headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
        )


class JWTValidator:
    """Validates Supabase Bearer JWTs and generates AuthContext."""

    def __init__(
        self,
        jwt_secret: Optional[str] = None,
        expected_issuer: Optional[str] = None,
        expected_audience: Optional[str] = None,
        leeway_seconds: int = 10,
    ):
        self.jwt_secret = (
            jwt_secret
            or os.getenv("SUPABASE_JWT_SECRET")
            or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            or "mock-chronos-super-secret-signing-key-32-chars-min"
        )
        if os.getenv("ENV") == "production":
            secret_env = os.getenv("SUPABASE_JWT_SECRET") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            if not secret_env or secret_env == "mock-chronos-super-secret-signing-key-32-chars-min":
                raise ValueError("SUPABASE_JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY must be configured with a secure non-default secret in production")
        self.expected_issuer = expected_issuer
        self.expected_audience = expected_audience
        self.leeway_seconds = leeway_seconds

    @property
    def is_test_mode(self) -> bool:
        return os.getenv("ENV") == "test" or os.getenv("MOCK_AUTH", "0") == "1"

    def decode_and_validate(self, token: str) -> AuthContext:
        """Decode and rigorously validate token signature, expiration, audience, and claims."""
        if not token or not isinstance(token, str):
            raise JWTValidationError("Missing or invalid authorization token")

        token = token.strip()
        if token.startswith("Bearer "):
            token = token[7:].strip()

        # Deterministic Mock Token Handler for Offline Unit & Integration Tests
        if self.is_test_mode and token.startswith("mock-jwt:"):
            return self._handle_mock_token(token)

        try:
            # Decode header to prevent alg=none attack
            unverified_header = jwt.get_unverified_header(token)
            alg = unverified_header.get("alg")
            if not alg or alg.lower() == "none" or alg not in ("HS256", "HS384", "HS512", "RS256"):
                logger.warning("Rejected token with unauthorized algorithm", extra={"alg": alg})
                raise JWTValidationError("Unsupported or insecure signing algorithm")

            options = {
                "verify_signature": True,
                "verify_exp": True,
                "verify_nbf": True,
                "verify_iat": True,
                "verify_aud": False,  # Custom check below
                "require": ["exp", "iat", "sub"],
            }

            claims = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=["HS256", "HS384", "HS512", "RS256"],
                options=options,
                leeway=self.leeway_seconds,
            )

            # Audience verification
            if self.expected_audience:
                token_aud = claims.get("aud")
                if isinstance(token_aud, list):
                    if self.expected_audience not in token_aud:
                        raise JWTValidationError("Token audience mismatch")
                elif token_aud != self.expected_audience:
                    raise JWTValidationError("Token audience mismatch")

            # Issuer verification
            if self.expected_issuer:
                token_iss = claims.get("iss")
                if token_iss != self.expected_issuer:
                    raise JWTValidationError("Token issuer mismatch")

            return self._build_auth_context(claims)

        except jwt.ExpiredSignatureError:
            logger.info("Authentication failed: Token expired")
            raise JWTValidationError("Token signature has expired")
        except jwt.ImmatureSignatureError:
            logger.info("Authentication failed: Token not yet valid")
            raise JWTValidationError("Token is not yet valid (nbf)")
        except jwt.InvalidAudienceError:
            logger.info("Authentication failed: Audience mismatch")
            raise JWTValidationError("Token audience mismatch")
        except jwt.InvalidIssuerError:
            logger.info("Authentication failed: Issuer mismatch")
            raise JWTValidationError("Token issuer mismatch")
        except jwt.InvalidAlgorithmError:
            logger.warning("Authentication failed: Invalid algorithm")
            raise JWTValidationError("Unsupported or insecure token algorithm")
        except HTTPException:
            raise
        except jwt.PyJWTError as e:
            logger.warning(f"Authentication failed: Invalid token ({str(e)})")
            raise JWTValidationError(f"Invalid token: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected token validation error: {str(e)}")
            raise JWTValidationError("Authentication credential validation error")

    def _build_auth_context(self, claims: Dict[str, Any]) -> AuthContext:
        user_id = claims.get("sub")
        if not user_id:
            raise JWTValidationError("Token 'sub' claim missing")

        aud = claims.get("aud")
        role_claim = claims.get("role", "")
        app_metadata = claims.get("app_metadata", {})
        user_metadata = claims.get("user_metadata", {})

        is_service_role = (aud == "service_role" or role_claim == "service_role")

        # Derive tenant_id strictly from metadata, default to single-tenant if unassigned
        tenant_id = (
            claims.get("tenant_id")
            or app_metadata.get("tenant_id")
            or user_metadata.get("tenant_id")
            or "ten-00000001"
        )

        # Derive role: explicit role in claims/metadata
        resolved_role = (
            claims.get("role")
            or app_metadata.get("role")
            or user_metadata.get("role")
            or ("service_role" if is_service_role else "student")
        )

        # Check for illegal roles
        valid_roles = [r.value for r in UserRole]
        if resolved_role not in valid_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Invalid role in token claims: '{resolved_role}'",
            )

        return AuthContext(
            user_id=str(user_id),
            tenant_id=str(tenant_id),
            role=str(resolved_role),
            email=claims.get("email"),
            is_service_role=is_service_role,
            claims=claims,
        )

    def _handle_mock_token(self, token: str) -> AuthContext:
        """Parses test fixture token in format: mock-jwt:<user_id>:<tenant_id>:<role>"""
        parts = token.split(":")
        user_id = parts[1] if len(parts) > 1 else "usr-mock-001"
        tenant_id = parts[2] if len(parts) > 2 else "ten-mock-001"
        role = parts[3] if len(parts) > 3 else UserRole.STUDENT.value

        valid_roles = [r.value for r in UserRole]
        if role not in valid_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Invalid role in token claims: '{role}'",
            )

        return AuthContext(
            user_id=user_id,
            tenant_id=tenant_id,
            role=role,
            email=f"{user_id}@mock.test",
            is_service_role=(role == UserRole.SERVICE_ROLE.value),
            claims={"sub": user_id, "mock": True, "tenant_id": tenant_id, "role": role},
        )
