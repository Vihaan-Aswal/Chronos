"""
Unit tests for Chronos JWT authentication middleware and token decoding.
Validates RFC 7519 compliance, expiration, clock skew, audience, and tamper resistance.
"""
import pytest
from fastapi import HTTPException
from auth.jwt_validator import JWTValidator, JWTValidationError
from auth.context import AuthContext, UserRole
from tests.conftest import (
    JWT_TEST_SECRET,
    JWT_TEST_ALGORITHM,
    JWT_TEST_AUDIENCE,
    JWT_TEST_ISSUER,
    generate_test_jwt,
)


@pytest.mark.unit
class TestJWTValidationUnit:
    @pytest.fixture
    def validator(self):
        return JWTValidator(
            jwt_secret=JWT_TEST_SECRET,
            expected_audience=JWT_TEST_AUDIENCE,
            expected_issuer=JWT_TEST_ISSUER,
        )

    def test_valid_token_decodes_correct_auth_context(self, validator):
        token = generate_test_jwt(
            user_id="usr-teacher-42",
            tenant_id="ten-alpha",
            role="teacher",
            audience=JWT_TEST_AUDIENCE,
            issuer=JWT_TEST_ISSUER,
        )
        ctx = validator.decode_and_validate(f"Bearer {token}")
        assert ctx.user_id == "usr-teacher-42"
        assert ctx.tenant_id == "ten-alpha"
        assert ctx.role == "teacher"
        assert ctx.is_teacher is True
        assert ctx.is_student is False

    def test_missing_token_raises_401(self, validator):
        with pytest.raises(HTTPException) as exc_info:
            validator.decode_and_validate("")
        assert exc_info.value.status_code == 401
        assert "Missing" in exc_info.value.detail or "invalid" in exc_info.value.detail.lower()

    def test_expired_token_raises_401(self, validator):
        expired_token = generate_test_jwt(
            expires_in_seconds=-30,
            audience=JWT_TEST_AUDIENCE,
            issuer=JWT_TEST_ISSUER,
        )
        with pytest.raises(HTTPException) as exc_info:
            validator.decode_and_validate(f"Bearer {expired_token}")
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower()

    def test_immature_token_nbf_future_raises_401(self, validator):
        future_token = generate_test_jwt(
            not_before_offset=600,
            audience=JWT_TEST_AUDIENCE,
            issuer=JWT_TEST_ISSUER,
        )
        with pytest.raises(HTTPException) as exc_info:
            validator.decode_and_validate(f"Bearer {future_token}")
        assert exc_info.value.status_code == 401

    def test_invalid_audience_raises_401(self, validator):
        wrong_aud_token = generate_test_jwt(
            audience="wrong-service-aud",
            issuer=JWT_TEST_ISSUER,
        )
        with pytest.raises(HTTPException) as exc_info:
            validator.decode_and_validate(f"Bearer {wrong_aud_token}")
        assert exc_info.value.status_code == 401
        assert "audience" in exc_info.value.detail.lower()

    def test_invalid_issuer_raises_401(self, validator):
        wrong_iss_token = generate_test_jwt(
            audience=JWT_TEST_AUDIENCE,
            issuer="rogue-auth-server",
        )
        with pytest.raises(HTTPException) as exc_info:
            validator.decode_and_validate(f"Bearer {wrong_iss_token}")
        assert exc_info.value.status_code == 401
        assert "issuer" in exc_info.value.detail.lower()

    def test_signature_tampered_raises_401(self, validator):
        token = generate_test_jwt(audience=JWT_TEST_AUDIENCE, issuer=JWT_TEST_ISSUER)
        header_payload, _ = token.rsplit(".", 1)
        tampered_token = f"{header_payload}.fake_signature_bytes"
        with pytest.raises(HTTPException) as exc_info:
            validator.decode_and_validate(f"Bearer {tampered_token}")
        assert exc_info.value.status_code == 401

    def test_algorithm_none_rejected(self, validator):
        none_token = generate_test_jwt(
            algorithm="none",
            audience=JWT_TEST_AUDIENCE,
            issuer=JWT_TEST_ISSUER,
        )
        with pytest.raises(HTTPException) as exc_info:
            validator.decode_and_validate(f"Bearer {none_token}")
        assert exc_info.value.status_code == 401

    def test_wrong_secret_signature_fails(self, validator):
        forged_token = generate_test_jwt(
            secret="different-secret-key-that-does-not-match",
            audience=JWT_TEST_AUDIENCE,
            issuer=JWT_TEST_ISSUER,
        )
        with pytest.raises(HTTPException) as exc_info:
            validator.decode_and_validate(f"Bearer {forged_token}")
        assert exc_info.value.status_code == 401

    def test_illegal_role_claim_raises_403(self, validator):
        hacked_role_token = generate_test_jwt(
            role="super_hacker_admin",
            audience=JWT_TEST_AUDIENCE,
            issuer=JWT_TEST_ISSUER,
        )
        with pytest.raises(HTTPException) as exc_info:
            validator.decode_and_validate(f"Bearer {hacked_role_token}")
        assert exc_info.value.status_code == 403
        assert "Invalid role" in exc_info.value.detail

    def test_mock_token_parsing_in_test_mode(self, validator):
        mock_tok = "mock-jwt:usr-test-99:ten-99:teacher"
        ctx = validator.decode_and_validate(mock_tok)
        assert ctx.user_id == "usr-test-99"
        assert ctx.tenant_id == "ten-99"
        assert ctx.role == "teacher"
        assert ctx.is_teacher is True
