import json
import logging
import pytest
from chronos_logging import (
    redact_payload,
    ChronosJSONFormatter,
    get_logger,
)


@pytest.mark.privacy
class TestPrivacyRedaction:
    def test_redact_sensitive_keys_in_dict(self):
        sensitive_payload = {
            "user_id": "usr-12345",
            "password": "supersecretpassword123",
            "api_key": "sk_live_1234567890abcdef",
            "jwt_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy.signature",
            "normal_field": "public_data",
            "metadata": {
                "service_role_key": "secret-role-key-999",
                "safe_counter": 42,
            },
        }

        sanitized = redact_payload(sensitive_payload)

        assert sanitized["user_id"] == "usr-12345"
        assert sanitized["normal_field"] == "public_data"
        assert sanitized["metadata"]["safe_counter"] == 42
        assert sanitized["password"] == "[REDACTED_PRIVACY_SENSITIVE]"
        assert sanitized["api_key"] == "[REDACTED_PRIVACY_SENSITIVE]"
        assert sanitized["jwt_token"] == "[REDACTED_PRIVACY_SENSITIVE]"
        assert sanitized["metadata"]["service_role_key"] == "[REDACTED_PRIVACY_SENSITIVE]"

    def test_redact_biometric_embedding_vectors(self):
        embedding_vec = [0.05 * i for i in range(128)]
        payload = {
            "session_id": "ses-100",
            "embedding": embedding_vec,
            "raw_landmarks": [[0.1, 0.2, 0.3]] * 68,
        }

        sanitized = redact_payload(payload)
        assert sanitized["session_id"] == "ses-100"
        assert sanitized["embedding"] == "[REDACTED_PRIVACY_SENSITIVE]"
        assert sanitized["raw_landmarks"] == "[REDACTED_PRIVACY_SENSITIVE]"

    def test_redact_raw_student_answers(self):
        payload = {
            "participant_id": "usr-student-1",
            "answer_text": "Here is my essay answering question 1...",
            "submission_content": "SELECT * FROM users;",
            "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "size_bytes": 1024,
        }

        sanitized = redact_payload(payload)
        assert sanitized["participant_id"] == "usr-student-1"
        assert sanitized["content_hash"].startswith("sha256:")
        assert sanitized["size_bytes"] == 1024
        assert sanitized["answer_text"] == "[REDACTED_PRIVACY_SENSITIVE]"
        assert sanitized["submission_content"] == "[REDACTED_PRIVACY_SENSITIVE]"

    def test_chronos_json_formatter_structure_and_redaction(self):
        formatter = ChronosJSONFormatter()
        record = logging.LogRecord(
            name="chronos.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="Window finalized for participant",
            args=(),
            exc_info=None,
        )
        record.request_id = "req-001"
        record.session_id = "ses-001"
        record.participant_id = "usr-001"
        record.event_type = "WINDOW_FINALIZED"
        record.data = {
            "token": "secret_token_val",
            "window_id": "win-123",
            "observation_state": "VALID",
        }

        formatted = formatter.format(record)
        parsed = json.loads(formatted)

        assert parsed["logger"] == "chronos.test"
        assert parsed["level"] == "INFO"
        assert parsed["request_id"] == "req-001"
        assert parsed["session_id"] == "ses-001"
        assert parsed["participant_id"] == "usr-001"
        assert parsed["event_type"] == "WINDOW_FINALIZED"
        assert parsed["data"]["window_id"] == "win-123"
        assert parsed["data"]["observation_state"] == "VALID"
        assert parsed["data"]["token"] == "[REDACTED_PRIVACY_SENSITIVE]"
