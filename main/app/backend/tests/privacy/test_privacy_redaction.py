"""
Unit Tests for Log Redaction & Privacy Key Scrubbing (W6.7)
Verifies:
- All sensitive keys (typed_content, raw_answer, embedding, secret, token, jwt, signature) are scrubbed
- Raw embedding vectors (>= 10 floats) are redacted
"""
import logging
import json
import pytest
from chronos_logging import redact_payload, ChronosJSONFormatter


def test_redact_payload_banned_keys():
    """Verify sensitive keys in dictionaries are redacted."""
    sensitive_dict = {
        "user_id": "usr-123",
        "secret_key": "super_secret_val",
        "typed_content": "This is student answer text",
        "typed_text": "Another answer draft",
        "student_response": "Essay response",
        "raw_answer": "Answer contents",
        "signature": "client_sig_123",
        "nested": {
            "jwt_token": "eyJhbGciOi...",
            "safe_metric": 42.5,
        },
    }

    cleaned = redact_payload(sensitive_dict)
    assert cleaned["user_id"] == "usr-123"
    assert cleaned["secret_key"] == "[REDACTED_PRIVACY_SENSITIVE]"
    assert cleaned["typed_content"] == "[REDACTED_PRIVACY_SENSITIVE]"
    assert cleaned["typed_text"] == "[REDACTED_PRIVACY_SENSITIVE]"
    assert cleaned["student_response"] == "[REDACTED_PRIVACY_SENSITIVE]"
    assert cleaned["raw_answer"] == "[REDACTED_PRIVACY_SENSITIVE]"
    assert cleaned["signature"] == "[REDACTED_PRIVACY_SENSITIVE]"
    assert cleaned["nested"]["jwt_token"] == "[REDACTED_PRIVACY_SENSITIVE]"
    assert cleaned["nested"]["safe_metric"] == 42.5


def test_redact_embedding_vector():
    """Verify long numerical vectors (biometric embeddings) are scrubbed."""
    vector = [0.123, 0.456, -0.789, 0.321, 0.654, -0.987, 0.111, 0.222, 0.333, 0.444, 0.555]
    cleaned = redact_payload(vector)
    assert cleaned == "[REDACTED_EMBEDDING_VECTOR]"


def test_json_formatter_sanitizes_extra_record_attributes():
    """Verify ChronosJSONFormatter scrubs custom logger record attributes."""
    formatter = ChronosJSONFormatter()
    record = logging.LogRecord(
        name="chronos.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=10,
        msg="Processing telemetry",
        args=(),
        exc_info=None,
    )
    setattr(record, "typed_content", "confidential essay text")
    setattr(record, "embedding", [0.1] * 12)

    formatted_str = formatter.format(record)
    parsed = json.loads(formatted_str)

    assert parsed["typed_content"] == "[REDACTED_PRIVACY_SENSITIVE]"
    assert parsed["embedding"] == "[REDACTED_PRIVACY_SENSITIVE]"
