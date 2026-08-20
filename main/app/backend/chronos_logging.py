import json
import logging
import re
import sys
import time
from typing import Any, Dict, Optional

# Banned / sensitive keys that must always be redacted
BANNED_KEY_PATTERNS = [
    r"secret",
    r"password",
    r"token",
    r"jwt",
    r"api[_-]?key",
    r"service[_-]?role",
    r"authorization",
    r"cookie",
    r"credential",
    r"embedding",
    r"landmark",
    r"frame",
    r"image",
    r"raw[_-]?image",
    r"audio",
    r"answer[_-]?text",
    r"essay",
    r"submission[_-]?content",
]

BANNED_KEY_RE = re.compile("|".join(BANNED_KEY_PATTERNS), re.IGNORECASE)


def redact_payload(obj: Any) -> Any:
    """Recursively scrub and redact privacy-sensitive data from objects."""
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            if BANNED_KEY_RE.search(str(k)):
                cleaned[k] = "[REDACTED_PRIVACY_SENSITIVE]"
            else:
                cleaned[k] = redact_payload(v)
        return cleaned
    elif isinstance(obj, (list, tuple)):
        # Check if list appears to be a raw biometric embedding vector
        if len(obj) >= 10 and all(isinstance(x, (int, float)) for x in obj[:10]):
            return "[REDACTED_EMBEDDING_VECTOR]"
        return [redact_payload(item) for item in obj]
    elif isinstance(obj, str):
        # Redact long base64 image strings or potential JWT tokens
        if obj.startswith("data:image/") or (len(obj) > 120 and "eyJh" in obj):
            return "[REDACTED_TOKEN_OR_MEDIA]"
        return obj
    return obj


class ChronosJSONFormatter(logging.Formatter):
    """Canonical Chronos JSON Log Formatter."""

    def format(self, record: logging.LogRecord) -> str:
        timestamp_iso = time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)
        )

        # Build structured envelope
        log_entry: Dict[str, Any] = {
            "timestamp": timestamp_iso,
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", None),
            "tenant_id": getattr(record, "tenant_id", None),
            "session_id": getattr(record, "session_id", None),
            "participant_id": getattr(record, "participant_id", None),
            "event_id": getattr(record, "event_id", None),
            "event_type": getattr(record, "event_type", None),
            "policy_id": getattr(record, "policy_id", None),
            "policy_version": getattr(record, "policy_version", None),
            "is_demo": getattr(record, "is_demo", False),
            "outcome": getattr(record, "outcome", "SUCCESS"),
            "latency_ms": getattr(record, "latency_ms", None),
            "message": record.getMessage(),
        }

        # Attach and sanitize extra structured payload if provided
        data = getattr(record, "data", None)
        if data is not None:
            log_entry["data"] = redact_payload(data)

        # Sanitize exception info if present
        if record.exc_info:
            exc_text = self.formatException(record.exc_info)
            # Redact high-entropy token strings from tracebacks
            log_entry["exception"] = re.sub(
                r"eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}",
                "[REDACTED_JWT]",
                exc_text,
            )

        return json.dumps(log_entry)


class ChronosLoggerAdapter(logging.LoggerAdapter):
    """Contextual LoggerAdapter for attaching request/session metadata."""

    def process(self, msg: Any, kwargs: Any) -> tuple[Any, Any]:
        extra = kwargs.setdefault("extra", {})
        if self.extra:
            for k, v in self.extra.items():
                if k not in extra:
                    extra[k] = v
        return msg, kwargs


def get_logger(name: str, **context: Any) -> logging.LoggerAdapter:
    """Obtain a structured Chronos logger with optional static context."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(ChronosJSONFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return ChronosLoggerAdapter(logger, context)
