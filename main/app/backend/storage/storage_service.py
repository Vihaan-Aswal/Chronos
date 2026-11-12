"""
Chronos Backend - Storage and Validation Foundation
Workstream: Resource-Supported Assessment Vertical Slice

Provides secure storage abstraction, file validation (magic headers, size limits,
MIME & extension checks), cryptographic hashing (SHA-256), safe storage path generation,
signed expiring URLs, integrity verification, and cleanup/orphan handling.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import time
import urllib.parse
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from chronos_logging import get_logger

logger = get_logger("chronos.storage")

# ---------------------------------------------------------------------------
# Constants & Configuration
# ---------------------------------------------------------------------------

MAX_FILE_SIZE_BYTES: int = 20 * 1024 * 1024  # 20 MB (20,971,520 bytes)
DEFAULT_SIGNED_URL_TTL_SECONDS: int = 900    # 15 minutes (900 seconds)

# Magic headers for binary inspection
MAGIC_PDF_HEADER: bytes = b"%PDF"
MAGIC_PNG_HEADER: bytes = b"\x89PNG\r\n\x1a\n"
MAGIC_JPEG_HEADER: bytes = b"\xff\xd8\xff"

# Allowed file extensions and MIME types
ALLOWED_EXTENSIONS = frozenset({".pdf", ".png", ".jpg", ".jpeg"})
ALLOWED_MIME_TYPES = frozenset({
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
})

EXTENSION_TO_MIME = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}

MIME_TO_CANONICAL_EXT = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
}


# ---------------------------------------------------------------------------
# Storage Exceptions
# ---------------------------------------------------------------------------

class StorageError(Exception):
    """Base exception for storage subsystem errors."""
    pass


class StorageValidationError(StorageError):
    """Raised when an artifact fails security, magic header, or size validations."""
    pass


class StorageNotFoundError(StorageError):
    """Raised when an artifact cannot be located at the specified storage path."""
    pass


class StorageIntegrityError(StorageError):
    """Raised when artifact SHA-256 content verification fails."""
    pass


# ---------------------------------------------------------------------------
# File Inspection, Hashing & Path Utilities
# ---------------------------------------------------------------------------

def compute_content_hash(content: bytes) -> str:
    """Computes SHA-256 hash of byte content formatted as lowercase hexadecimal."""
    return hashlib.sha256(content).hexdigest().lower()


def inspect_magic_header(content: bytes) -> Tuple[str, str]:
    """
    Inspects the leading bytes of the artifact to identify its true binary format.
    Returns (detected_mime_type, canonical_extension).
    Raises StorageValidationError if content does not start with an allowed magic signature.
    """
    if not content or len(content) == 0:
        raise StorageValidationError("File content is empty (0 bytes).")

    if content.startswith(MAGIC_PDF_HEADER):
        return "application/pdf", ".pdf"
    elif content.startswith(MAGIC_PNG_HEADER):
        return "image/png", ".png"
    elif content.startswith(MAGIC_JPEG_HEADER):
        return "image/jpeg", ".jpg"
    else:
        raise StorageValidationError(
            "Security validation failed: File magic header does not match any allowed formats "
            "(PDF starting with '%PDF', PNG starting with '\\x89PNG\\r\\n\\x1a\\n', or JPEG starting with '\\xff\\xd8\\xff')."
        )


def validate_file_content(
    content: bytes,
    filename: Optional[str] = None,
    content_type: Optional[str] = None,
    max_size_bytes: int = MAX_FILE_SIZE_BYTES,
) -> Tuple[str, str]:
    """
    Performs comprehensive security and integrity validation on file contents:
    1. Rejects 0-byte (empty) files.
    2. Rejects files exceeding max_size_bytes limit (default 20MB).
    3. Validates magic binary header signatures (PDF, PNG, JPG/JPEG).
    4. Validates declared filename extension matches allowed extensions and binary format.
    5. Validates declared Content-Type MIME matches allowed MIME types and binary format.

    Returns:
        Tuple[str, str]: (detected_mime_type, canonical_extension)
    """
    if not content or len(content) == 0:
        raise StorageValidationError("File content is empty (0 bytes).")

    if len(content) > max_size_bytes:
        raise StorageValidationError(
            f"File size {len(content)} bytes exceeds maximum allowed limit of "
            f"{max_size_bytes} bytes ({max_size_bytes // (1024 * 1024)} MB)."
        )

    detected_mime, canonical_ext = inspect_magic_header(content)

    if filename:
        ext = Path(filename).suffix.lower()
        if not ext:
            raise StorageValidationError(
                f"Filename '{filename}' is missing a valid file extension. "
                f"Allowed extensions: {sorted(list(ALLOWED_EXTENSIONS))}."
            )
        if ext not in ALLOWED_EXTENSIONS:
            raise StorageValidationError(
                f"File extension '{ext}' is not permitted. "
                f"Allowed extensions: {sorted(list(ALLOWED_EXTENSIONS))}."
            )
        expected_mime = EXTENSION_TO_MIME[ext]
        if expected_mime != detected_mime:
            raise StorageValidationError(
                f"File extension '{ext}' ({expected_mime}) does not match detected binary magic header "
                f"({detected_mime}). Potential file extension spoofing detected."
            )

    if content_type:
        clean_mime = content_type.split(";")[0].strip().lower()
        if clean_mime == "image/jpg":
            clean_mime = "image/jpeg"
        if clean_mime not in ALLOWED_MIME_TYPES:
            raise StorageValidationError(
                f"Declared MIME type '{content_type}' is not permitted. "
                f"Allowed MIME types: {sorted(list(ALLOWED_MIME_TYPES))}."
            )
        if clean_mime != detected_mime:
            raise StorageValidationError(
                f"Declared MIME type '{clean_mime}' does not match detected binary magic header ({detected_mime})."
            )

    return detected_mime, canonical_ext


def sanitize_filename(filename: str) -> str:
    """
    Sanitizes filename against directory traversal attacks, illegal characters,
    and dangerous symbols.
    """
    if not filename:
        return "artifact"
    # Take only the base name (prevents directory traversal e.g. ../ or c:\)
    base = os.path.basename(filename.replace("\\", "/"))
    # Remove null bytes and non-printable characters
    base = base.replace("\0", "")
    # Replace non-safe characters with underscore
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", base)
    # Strip leading dots and dashes
    safe = safe.lstrip(".-")
    return safe or "artifact"


def generate_resource_storage_path(
    session_id: str, resource_id: str, filename: str
) -> str:
    """
    Generates a deterministic, unique storage path for an assessment resource.
    Example: sessions/{session_id}/resources/{resource_id}_{filename}
    """
    safe_name = sanitize_filename(filename)
    return f"sessions/{session_id}/resources/{resource_id}_{safe_name}"


def generate_answer_storage_path(
    session_id: str, participant_id: str, version: int, filename: str
) -> str:
    """
    Generates a deterministic, unique storage path for a participant's answer submission version.
    Example: sessions/{session_id}/answers/{participant_id}_{version}_{filename}
    """
    safe_name = sanitize_filename(filename)
    return f"sessions/{session_id}/answers/{participant_id}_{version}_{safe_name}"


# ---------------------------------------------------------------------------
# Storage Service Abstract Interface
# ---------------------------------------------------------------------------

class StorageService(ABC):
    """Abstract interface defining the contract for Chronos storage operations."""

    @abstractmethod
    def upload_file(
        self,
        path: str,
        content: bytes,
        content_type: Optional[str] = None,
        validate: bool = True,
    ) -> str:
        """
        Uploads and persists artifact content at the specified path.
        Returns the confirmed storage path.
        """
        pass

    @abstractmethod
    def download_file(
        self, path: str, expected_hash: Optional[str] = None
    ) -> bytes:
        """
        Downloads artifact content from storage.
        If expected_hash is provided, validates SHA-256 content integrity.
        """
        pass

    @abstractmethod
    def delete_file(self, path: str) -> bool:
        """
        Deletes the artifact at path. Returns True if deleted, False otherwise.
        """
        pass

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Checks if an artifact exists at the specified storage path."""
        pass

    @abstractmethod
    def create_signed_url(
        self, path: str, expires_in: int = DEFAULT_SIGNED_URL_TTL_SECONDS
    ) -> str:
        """
        Generates a secure, expiring download URL for the artifact.
        Default TTL: 15 minutes (900 seconds).
        """
        pass

    @abstractmethod
    def cleanup_orphan(self, path: str) -> bool:
        """
        Removes an orphaned or aborted artifact without raising unhandled errors.
        Returns True if cleanup succeeded or file was absent.
        """
        pass


# ---------------------------------------------------------------------------
# Local Storage Test Double Implementation
# ---------------------------------------------------------------------------

class LocalStorageService(StorageService):
    """
    Fast, deterministic in-memory & local filesystem test double.
    Supports secure validation, content verification, HMAC signed URLs, and cleanup.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000/api/v1/storage",
        secret_key: str = "chronos-local-storage-secret-signing-key-32-chars",
        base_dir: Optional[Union[str, Path]] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.secret_key = secret_key
        self.base_dir = Path(base_dir) if base_dir else None
        self._store: Dict[str, Dict[str, Any]] = {}

        if self.base_dir:
            self.base_dir.mkdir(parents=True, exist_ok=True)

    def upload_file(
        self,
        path: str,
        content: bytes,
        content_type: Optional[str] = None,
        validate: bool = True,
    ) -> str:
        clean_path = path.lstrip("/")
        detected_mime = content_type or "application/octet-stream"

        if validate:
            detected_mime, _ = validate_file_content(
                content, filename=clean_path, content_type=content_type
            )

        content_hash = compute_content_hash(content)

        # In-memory storage
        self._store[clean_path] = {
            "content": content,
            "content_type": detected_mime,
            "content_hash": content_hash,
            "size_bytes": len(content),
            "created_at": time.time(),
        }

        # Optional local disk storage
        if self.base_dir:
            dest = (self.base_dir / clean_path).resolve()
            # Directory traversal prevention
            if not str(dest).startswith(str(self.base_dir.resolve())):
                raise StorageValidationError(f"Invalid path traversal attempt: {path}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(content)

        return clean_path

    def download_file(
        self, path: str, expected_hash: Optional[str] = None
    ) -> bytes:
        clean_path = path.lstrip("/")
        content: Optional[bytes] = None

        if clean_path in self._store:
            content = self._store[clean_path]["content"]
        elif self.base_dir:
            dest = self.base_dir / clean_path
            if dest.exists() and dest.is_file():
                content = dest.read_bytes()

        if content is None:
            raise StorageNotFoundError(f"Artifact not found at storage path: '{clean_path}'")

        if expected_hash:
            actual_hash = compute_content_hash(content)
            if actual_hash.lower() != expected_hash.lower():
                raise StorageIntegrityError(
                    f"Integrity check failed for '{clean_path}': expected SHA-256 {expected_hash}, got {actual_hash}."
                )

        return content

    def delete_file(self, path: str) -> bool:
        clean_path = path.lstrip("/")
        deleted = False
        if clean_path in self._store:
            del self._store[clean_path]
            deleted = True

        if self.base_dir:
            dest = self.base_dir / clean_path
            if dest.exists() and dest.is_file():
                dest.unlink()
                deleted = True

        return deleted

    def exists(self, path: str) -> bool:
        clean_path = path.lstrip("/")
        if clean_path in self._store:
            return True
        if self.base_dir:
            return (self.base_dir / clean_path).is_file()
        return False

    def create_signed_url(
        self, path: str, expires_in: int = DEFAULT_SIGNED_URL_TTL_SECONDS
    ) -> str:
        clean_path = path.lstrip("/")
        expires_at = int(time.time()) + expires_in
        payload = f"{clean_path}:{expires_at}".encode("utf-8")
        signature = hmac.new(
            self.secret_key.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()
        encoded_path = urllib.parse.quote(clean_path, safe="")
        return (
            f"{self.base_url}/download?path={encoded_path}&expires_at={expires_at}&signature={signature}"
        )

    def verify_signed_url(self, path: str, expires_at: int, signature: str) -> bool:
        """Verifies HMAC signature and expiration timestamp for a download request."""
        clean_path = path.lstrip("/")
        if time.time() > expires_at:
            return False
        payload = f"{clean_path}:{expires_at}".encode("utf-8")
        expected_sig = hmac.new(
            self.secret_key.encode("utf-8"), payload, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(signature, expected_sig)

    def cleanup_orphan(self, path: str) -> bool:
        """Deletes artifact on aborted or failed operations."""
        try:
            self.delete_file(path)
            return True
        except Exception as e:
            logger.warning(f"Error during orphan cleanup at {path}: {e}")
            return False

    def clear(self) -> None:
        """Clears all stored in-memory artifacts."""
        self._store.clear()


# ---------------------------------------------------------------------------
# Supabase Storage Integration
# ---------------------------------------------------------------------------

class SupabaseStorageService(StorageService):
    """
    Production Supabase Storage bucket client.
    Integrates with Supabase Storage buckets, creating signed expiring download URLs
    and managing artifact lifecycle.
    """

    def __init__(
        self,
        supabase_client: Any,
        bucket_name: str = "chronos-artifacts",
    ):
        self.supabase = supabase_client
        self.bucket_name = bucket_name

    def _get_bucket(self) -> Any:
        return self.supabase.storage.from_(self.bucket_name)

    def upload_file(
        self,
        path: str,
        content: bytes,
        content_type: Optional[str] = None,
        validate: bool = True,
    ) -> str:
        clean_path = path.lstrip("/")
        detected_mime = content_type or "application/octet-stream"

        if validate:
            detected_mime, _ = validate_file_content(
                content, filename=clean_path, content_type=content_type
            )

        file_options = {
            "content-type": detected_mime,
            "upsert": "true",
        }

        try:
            bucket = self._get_bucket()
            bucket.upload(clean_path, content, file_options)
            return clean_path
        except StorageValidationError:
            raise
        except Exception as e:
            logger.error(f"Supabase storage upload error for '{clean_path}': {e}")
            raise StorageError(f"Failed to upload artifact to Supabase storage: {e}") from e

    def download_file(
        self, path: str, expected_hash: Optional[str] = None
    ) -> bytes:
        clean_path = path.lstrip("/")
        try:
            bucket = self._get_bucket()
            content = bucket.download(clean_path)
            if content is None:
                raise StorageNotFoundError(
                    f"Artifact not found in Supabase storage: '{clean_path}'"
                )
        except StorageNotFoundError:
            raise
        except Exception as e:
            logger.warning(f"Supabase storage download error for '{clean_path}': {e}")
            raise StorageNotFoundError(
                f"Artifact not found or inaccessible in Supabase storage: '{clean_path}'"
            ) from e

        if expected_hash:
            actual_hash = compute_content_hash(content)
            if actual_hash.lower() != expected_hash.lower():
                raise StorageIntegrityError(
                    f"Integrity check failed for '{clean_path}': expected SHA-256 {expected_hash}, got {actual_hash}."
                )

        return content

    def delete_file(self, path: str) -> bool:
        clean_path = path.lstrip("/")
        try:
            bucket = self._get_bucket()
            bucket.remove([clean_path])
            return True
        except Exception as e:
            logger.warning(f"Failed to delete '{clean_path}' from Supabase storage: {e}")
            return False

    def exists(self, path: str) -> bool:
        clean_path = path.lstrip("/")
        try:
            bucket = self._get_bucket()
            parent = str(Path(clean_path).parent).replace("\\", "/")
            if parent == ".":
                parent = ""
            name = Path(clean_path).name
            files = bucket.list(parent)
            if isinstance(files, list):
                return any(
                    (f.get("name") == name if isinstance(f, dict) else getattr(f, "name", None) == name)
                    for f in files
                )
            return False
        except Exception:
            return False

    def create_signed_url(
        self, path: str, expires_in: int = DEFAULT_SIGNED_URL_TTL_SECONDS
    ) -> str:
        clean_path = path.lstrip("/")
        try:
            bucket = self._get_bucket()
            res = bucket.create_signed_url(clean_path, expires_in)
            if isinstance(res, dict):
                url = res.get("signedURL") or res.get("signedUrl") or res.get("url")
                if url:
                    return str(url)
            elif isinstance(res, str):
                return res
            elif hasattr(res, "signed_url"):
                return str(res.signed_url)
            return str(res)
        except Exception as e:
            logger.error(f"Failed to create signed URL for '{clean_path}': {e}")
            raise StorageError(f"Failed to generate signed URL from Supabase storage: {e}") from e

    def cleanup_orphan(self, path: str) -> bool:
        """Safely cleans up artifact without propagating exceptions."""
        try:
            return self.delete_file(path)
        except Exception as e:
            logger.warning(f"Error during orphan cleanup for '{path}': {e}")
            return False


# ---------------------------------------------------------------------------
# Global Storage Singleton & Accessors
# ---------------------------------------------------------------------------

_STORAGE_SERVICE_INSTANCE: Optional[StorageService] = None


def get_storage_service(
    provider: Optional[str] = None,
    supabase_client: Optional[Any] = None,
    bucket_name: str = "chronos-artifacts",
) -> StorageService:
    """
    Returns the configured StorageService instance.
    Defaults to LocalStorageService for testing/development environments.
    """
    global _STORAGE_SERVICE_INSTANCE
    if _STORAGE_SERVICE_INSTANCE is not None and provider is None:
        return _STORAGE_SERVICE_INSTANCE

    chosen_provider = provider or os.getenv("STORAGE_PROVIDER", "local").lower()
    is_test = os.getenv("ENV") == "test" or os.getenv("MOCK_AUTH", "0") == "1"

    if chosen_provider == "supabase" and not is_test and supabase_client:
        service = SupabaseStorageService(supabase_client=supabase_client, bucket_name=bucket_name)
    else:
        service = LocalStorageService()

    if _STORAGE_SERVICE_INSTANCE is None:
        _STORAGE_SERVICE_INSTANCE = service
    return service


def set_storage_service(service: StorageService) -> None:
    """Explicitly inject a StorageService singleton (e.g. for testing)."""
    global _STORAGE_SERVICE_INSTANCE
    _STORAGE_SERVICE_INSTANCE = service
