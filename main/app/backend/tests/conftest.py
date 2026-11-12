"""
Chronos Backend Test Harness & Deterministic Fixtures
"""
import os
import random
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
import jwt
import pytest

JWT_TEST_SECRET = "mock-chronos-super-secret-signing-key-32-chars-min"
JWT_TEST_ALGORITHM = "HS256"
JWT_TEST_AUDIENCE = "authenticated"
JWT_TEST_ISSUER = "chronos-auth-service"


# ---------------------------------------------------------------------------
# 1. Deterministic Clock Subsystem
# ---------------------------------------------------------------------------

class DeterministicClock:
    """Provides frozen or strictly advancing UTC timestamps for deterministic testing."""

    def __init__(self, initial_iso: str = "2026-08-20T10:00:00Z"):
        self._current_time = datetime.fromisoformat(initial_iso.replace("Z", "+00:00"))

    def now(self) -> datetime:
        return self._current_time

    def now_iso(self) -> str:
        return self._current_time.strftime("%Y-%m-%dT%H:%M:%SZ")

    def timestamp(self) -> float:
        return self._current_time.timestamp()

    def advance(self, seconds: float) -> datetime:
        self._current_time += timedelta(seconds=seconds)
        return self._current_time


# ---------------------------------------------------------------------------
# 2. Deterministic ID Generator
# ---------------------------------------------------------------------------

class DeterministicIDGenerator:
    """Generates reproducible UUIDs and sequential IDs for domain testing."""

    def __init__(self, seed: int = 1):
        self._counter = seed

    def next_uuid(self, prefix: str = "00000000") -> str:
        self._counter += 1
        return f"{prefix}-0000-0000-0000-{self._counter:012d}"

    def next_id(self, prefix: str = "id") -> str:
        self._counter += 1
        return f"{prefix}_{self._counter:06d}"


# ---------------------------------------------------------------------------
# 3. Test JWT Generator
# ---------------------------------------------------------------------------

def generate_test_jwt(
    user_id: str = "usr-student-001",
    tenant_id: str = "ten-00000001",
    role: str = "student",
    expires_in_seconds: int = 3600,
    not_before_offset: int = 0,
    audience: Optional[str] = JWT_TEST_AUDIENCE,
    issuer: Optional[str] = None,
    secret: str = JWT_TEST_SECRET,
    algorithm: str = JWT_TEST_ALGORITHM,
    custom_claims: Optional[Dict[str, Any]] = None,
) -> str:
    """Mints synthetic, deterministic JWTs with configurable security properties."""
    now = int(time.time())
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "email": f"{user_id}@synthetic.test",
        "iat": now,
        "nbf": now + not_before_offset,
        "exp": now + expires_in_seconds,
        "app_metadata": {"tenant_id": tenant_id, "role": role},
        "user_metadata": {"tenant_id": tenant_id, "role": role},
    }
    if audience is not None:
        payload["aud"] = audience
    if issuer is not None:
        payload["iss"] = issuer
    if custom_claims:
        payload.update(custom_claims)

    if algorithm.lower() == "none":
        return jwt.encode(payload, key="", algorithm="none")
    return jwt.encode(payload, secret, algorithm=algorithm)


# ---------------------------------------------------------------------------
# 4. In-Memory Mock Supabase Client
# ---------------------------------------------------------------------------

class MockResponse:
    def __init__(self, data: Any = None, count: Optional[int] = None):
        self.data = data
        self.count = (
            count
            if count is not None
            else (len(data) if isinstance(data, list) else 1)
        )


class MockTableQueryBuilder:
    def __init__(self, table_name: str, store: Dict[str, List[Dict[str, Any]]]):
        self.table_name = table_name
        self.store = store
        self._filters: List[tuple[str, Any]] = []
        self._gte_filters: List[tuple[str, Any]] = []
        self._gt_filters: List[tuple[str, Any]] = []
        self._lte_filters: List[tuple[str, Any]] = []
        self._lt_filters: List[tuple[str, Any]] = []
        self._in_filters: List[tuple[str, List[Any]]] = []
        self._or_filters: List[str] = []
        self._pending_insert: Optional[List[Dict[str, Any]]] = None
        self._pending_upsert: Optional[List[Dict[str, Any]]] = None
        self._pending_update: Optional[Dict[str, Any]] = None
        self._is_delete = False
        self._order_col: Optional[str] = None
        self._order_desc: bool = False
        self._limit_val: Optional[int] = None

    def select(self, columns: str = "*"):
        return self

    def eq(self, column: str, value: Any):
        self._filters.append((column, value))
        return self

    def gte(self, column: str, value: Any):
        self._gte_filters.append((column, value))
        return self

    def gt(self, column: str, value: Any):
        self._gt_filters.append((column, value))
        return self

    def lte(self, column: str, value: Any):
        self._lte_filters.append((column, value))
        return self

    def lt(self, column: str, value: Any):
        self._lt_filters.append((column, value))
        return self

    def in_(self, column: str, values: List[Any]):
        self._in_filters.append((column, list(values)))
        return self

    def or_(self, filter_expr: str):
        self._or_filters.append(filter_expr)
        return self

    def order(self, column: str, desc: bool = False):
        self._order_col = column
        self._order_desc = desc
        return self

    def limit(self, count: int):
        self._limit_val = count
        return self

    def insert(self, data: Any):
        rows = data if isinstance(data, list) else [data]
        self._pending_insert = [dict(r) for r in rows]
        return self

    def upsert(self, data: Any):
        rows = data if isinstance(data, list) else [data]
        self._pending_upsert = [dict(r) for r in rows]
        return self

    def update(self, data: Dict[str, Any]):
        self._pending_update = dict(data)
        return self

    def delete(self):
        self._is_delete = True
        return self

    def execute(self) -> MockResponse:
        table_rows = self.store.setdefault(self.table_name, [])

        if self._pending_insert is not None:
            saved = []
            for r in self._pending_insert:
                row = dict(r)
                if (
                    "id" not in row
                    and "session_id" not in row
                    and "user_id" not in row
                    and "event_id" not in row
                    and "consent_id" not in row
                    and "hold_id" not in row
                    and "request_id" not in row
                    and "tombstone_id" not in row
                    and "audit_id" not in row
                ):
                    row["id"] = str(uuid.uuid4())
                table_rows.append(row)
                saved.append(row)
            self._pending_insert = None
            return MockResponse(data=saved)

        if self._pending_update is not None:
            updated_rows = []
            for row in table_rows:
                matches = all(row.get(col) == val for col, val in self._filters)
                if matches:
                    row.update(self._pending_update)
                    updated_rows.append(row)
            self._pending_update = None
            return MockResponse(data=updated_rows)

        if self._pending_upsert is not None:
            saved = []
            for r in self._pending_upsert:
                row = dict(r)
                match_idx = None
                for idx, existing in enumerate(table_rows):
                    # Composite key for consent_records: (tenant_id, session_id, subject_id, scope) or consent_id
                    if "consent_id" in row and existing.get("consent_id") == row["consent_id"]:
                        match_idx = idx
                        break
                    if "tenant_id" in row and "subject_id" in row and "scope" in row and self.table_name == "consent_records":
                        if (
                            existing.get("tenant_id") == row["tenant_id"]
                            and existing.get("subject_id") == row["subject_id"]
                            and existing.get("scope") == row["scope"]
                            and existing.get("session_id") == row.get("session_id")
                        ):
                            match_idx = idx
                            break
                    # Composite key: (session_id, participant_id) for participant_projections
                    if "session_id" in row and "participant_id" in row:
                        if (
                            existing.get("session_id") == row["session_id"]
                            and existing.get("participant_id") == row["participant_id"]
                        ):
                            if "version" in row and existing.get("version") != row.get("version"):
                                continue
                            match_idx = idx
                            break
                    # Composite key check for session_participants (session_id, user_id)
                    if "session_id" in row and "user_id" in row:
                        if (
                            existing.get("session_id") == row["session_id"]
                            and existing.get("user_id") == row["user_id"]
                        ):
                            match_idx = idx
                            break
                    if "hold_id" in row and existing.get("hold_id") == row["hold_id"]:
                        match_idx = idx
                        break
                    if "request_id" in row and existing.get("request_id") == row["request_id"]:
                        match_idx = idx
                        break
                    if "tombstone_id" in row and existing.get("tombstone_id") == row["tombstone_id"]:
                        match_idx = idx
                        break
                    if "audit_id" in row and existing.get("audit_id") == row["audit_id"]:
                        match_idx = idx
                        break
                    if "case_id" in row and existing.get("case_id") == row["case_id"]:
                        match_idx = idx
                        break
                    if "resource_id" in row and existing.get("resource_id") == row["resource_id"]:
                        match_idx = idx
                        break
                    if "answer_id" in row and existing.get("answer_id") == row["answer_id"]:
                        match_idx = idx
                        break
                    if "event_id" in row and existing.get("event_id") == row["event_id"]:
                        match_idx = idx
                        break
                    if "id" in row and existing.get("id") == row["id"]:
                        match_idx = idx
                        break
                    if "session_id" in row and existing.get("session_id") == row["session_id"] and self.table_name in ("session_summaries", "report_read_models", "sessions"):
                        match_idx = idx
                        break
                    if "user_id" in row and existing.get("user_id") == row["user_id"] and self.table_name in ("users", "identity_embeddings"):
                        match_idx = idx
                        break
                if match_idx is not None:
                    table_rows[match_idx].update(row)
                    saved.append(table_rows[match_idx])
                else:
                    if (
                        "id" not in row
                        and "user_id" not in row
                        and "session_id" not in row
                        and "event_id" not in row
                        and "case_id" not in row
                        and "resource_id" not in row
                        and "answer_id" not in row
                        and "consent_id" not in row
                        and "hold_id" not in row
                        and "request_id" not in row
                        and "tombstone_id" not in row
                        and "audit_id" not in row
                    ):
                        row["id"] = str(uuid.uuid4())
                    table_rows.append(row)
                    saved.append(row)
            self._pending_upsert = None
            return MockResponse(data=saved)

        if self._is_delete:
            remaining = []
            deleted = []
            for row in table_rows:
                matches = all(row.get(col) == val for col, val in self._filters)
                if matches:
                    deleted.append(row)
                else:
                    remaining.append(row)
            self.store[self.table_name] = remaining
            self._is_delete = False
            return MockResponse(data=deleted)

        # SELECT
        filtered = table_rows
        for col, val in self._filters:
            filtered = [r for r in filtered if r.get(col) == val]
        for col, val in self._gte_filters:
            filtered = [r for r in filtered if r.get(col) is not None and r.get(col) >= val]
        for col, val in self._gt_filters:
            filtered = [r for r in filtered if r.get(col) is not None and str(r.get(col)) > str(val)]
        for col, val in self._lte_filters:
            filtered = [r for r in filtered if r.get(col) is not None and r.get(col) <= val]
        for col, val in self._lt_filters:
            filtered = [r for r in filtered if r.get(col) is not None and str(r.get(col)) < str(val)]
        for col, vals in self._in_filters:
            filtered = [r for r in filtered if r.get(col) in vals]

        # Process simple .or_("a.eq.1,b.is.null")
        for or_clause in self._or_filters:
            sub_clauses = [s.strip() for s in or_clause.split(",") if s.strip()]
            new_filtered = []
            for r in filtered:
                matched_any = False
                for sub in sub_clauses:
                    if ".eq." in sub:
                        field, val = sub.split(".eq.", 1)
                        if str(r.get(field)) == str(val):
                            matched_any = True
                            break
                    elif ".is.null" in sub:
                        field = sub.replace(".is.null", "").strip()
                        if r.get(field) is None:
                            matched_any = True
                            break
                if matched_any:
                    new_filtered.append(r)
            filtered = new_filtered

        if self._order_col:
            filtered = sorted(
                filtered,
                key=lambda x: (x.get(self._order_col) if x.get(self._order_col) is not None else 0),
                reverse=self._order_desc,
            )

        if self._limit_val:
            filtered = filtered[: self._limit_val]

        return MockResponse(data=filtered)


class MockEventStore:
    """In-memory append-only event store with idempotency and monotonic sequence allocation."""
    def __init__(self):
        self.events: List[Dict[str, Any]] = []
        self.event_id_set: set[str] = set()
        self.session_sequences: Dict[str, int] = {}

    def insert_event(self, event_data: Dict[str, Any]) -> tuple[Dict[str, Any], bool]:
        """
        Returns (persisted_event, is_duplicate).
        Handles idempotency: if event_id exists, return existing record without updating sequence.
        """
        evt_id = event_data["event_id"]
        session_id = event_data["session_id"]

        if evt_id in self.event_id_set:
            existing = next(e for e in self.events if e["event_id"] == evt_id)
            return existing, True

        curr_seq = self.session_sequences.get(session_id, 0) + 1
        self.session_sequences[session_id] = curr_seq

        persisted = dict(event_data)
        persisted["server_sequence"] = curr_seq
        self.events.append(persisted)
        self.event_id_set.add(evt_id)
        return persisted, False

    def query_events(self, session_id: str, participant_id: Optional[str] = None) -> List[Dict[str, Any]]:
        res = [e for e in self.events if e["session_id"] == session_id]
        if participant_id:
            res = [e for e in res if e["participant_id"] == participant_id]
        return sorted(res, key=lambda x: x["server_sequence"])


class MockStorageBucket:
    def __init__(self, bucket_name: str):
        self.bucket_name = bucket_name
        self.files: Dict[str, bytes] = {}

    def upload(self, path: str, file: bytes, file_options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self.files[path] = file
        return {"Key": f"{self.bucket_name}/{path}"}

    def download(self, path: str) -> bytes:
        if path not in self.files:
            raise Exception(f"The resource was not found: {path}")
        return self.files[path]

    def remove(self, paths: List[str]) -> List[Dict[str, Any]]:
        removed = []
        for p in paths:
            if p in self.files:
                del self.files[p]
                removed.append({"name": p})
        return removed

    def list(self, path: str = "") -> List[Dict[str, Any]]:
        prefix = path.strip("/")
        results = []
        for file_path in self.files:
            if not prefix or file_path.startswith(prefix):
                name = os.path.basename(file_path)
                results.append({"name": name, "id": file_path})
        return results

    def create_signed_url(self, path: str, expires_in: int = 900) -> Dict[str, str]:
        return {"signedURL": f"https://mock-supabase.storage/{self.bucket_name}/{path}?token=mock_token_{expires_in}"}


class MockStorageClient:
    def __init__(self):
        self._buckets: Dict[str, MockStorageBucket] = {}

    def from_(self, bucket_name: str) -> MockStorageBucket:
        if bucket_name not in self._buckets:
            self._buckets[bucket_name] = MockStorageBucket(bucket_name)
        return self._buckets[bucket_name]

    def reset(self):
        self._buckets.clear()


class MockSupabaseClient:
    """Thread-safe in-memory database simulation for Supabase queries."""

    def __init__(self):
        self.store: Dict[str, List[Dict[str, Any]]] = {
            "tenants": [],
            "tenant_members": [],
            "users": [],
            "sessions": [],
            "session_participants": [],
            "events": [],
            "session_events": [],
            "participant_projections": [],
            "finalized_windows": [],
            "session_cases": [],
            "session_summaries": [],
            "resource_projections": [],
            "answer_projections": [],
            "report_read_models": [],
            "cases": [],
            "resources": [],
            "answers": [],
            "consents": [],
            "consent_records": [],
            "legal_holds": [],
            "deletion_requests": [],
            "deletion_audit_tombstones": [],
            "audit_logs": [],
            "identity_embeddings": [],
            "session_analytics": [],
        }
        self.storage = MockStorageClient()

    def table(self, name: str) -> MockTableQueryBuilder:
        return MockTableQueryBuilder(name, self.store)

    def reset(self):
        for k in self.store:
            self.store[k].clear()
        self.storage.reset()




# ---------------------------------------------------------------------------
# 5. Mock 100ms (HMS) Video Subsystem
# ---------------------------------------------------------------------------

class MockHMSClient:
    """Mock client for 100ms video room token generation and recording policy."""

    def __init__(
        self,
        secret: str = "mock-hms-secret-minimum-32-chars-long",
        access_key: str = "mock-access-key",
    ):
        self.secret = secret
        self.access_key = access_key
        self.issued_tokens: List[Dict[str, Any]] = []

    def generate_token(
        self, user_id: str, role: str, room_id: str, ttl_minutes: int = 120
    ) -> str:
        assert role in ("teacher", "guest", "student"), f"Invalid role {role}"
        payload = {
            "access_key": self.access_key,
            "room_id": room_id,
            "user_id": user_id,
            "role": role,
            "type": "app",
            "version": 2,
            "iat": int(time.time()),
            "exp": int(time.time()) + (ttl_minutes * 60),
        }
        self.issued_tokens.append(payload)
        return f"mock_jwt_token_{user_id}_{role}"

    def verify_recording_disabled(self, room_config: Dict[str, Any]) -> bool:
        """In accordance with privacy requirements, provider recording must be disabled."""
        return room_config.get("recording", {}).get("enabled", False) is False


# ---------------------------------------------------------------------------
# Pytest Fixtures
# ---------------------------------------------------------------------------

_GLOBAL_MOCK_SUPABASE = MockSupabaseClient()


@pytest.fixture(autouse=True)
def enforce_test_isolation(monkeypatch):
    """Guarantees tests never contact live Supabase or external APIs."""
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("MOCK_AUTH", "1")
    monkeypatch.setenv("SUPABASE_URL", "https://mock-test-isolation.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "mock-test-service-role-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_TEST_SECRET)
    monkeypatch.setenv("HMS_ACCESS_KEY", "mock_test_hms_access")
    monkeypatch.setenv("HMS_SECRET", JWT_TEST_SECRET)
    monkeypatch.setenv("HMS_ROOM_ID", "mock_test_room_123")
    monkeypatch.delenv("RUN_LIVE_SUPABASE_TESTS", raising=False)
    random.seed(1337)

    # Patch global app instances
    import main
    from auth.dependencies import set_jwt_validator
    from auth.jwt_validator import JWTValidator
    from auth.rate_limiter import limiter
    from auth.ws_ticket import ws_ticket_manager
    from repository import ChronosDomainRepository
    from auth.meeting_token import MeetingTokenService

    _GLOBAL_MOCK_SUPABASE.reset()
    limiter.reset()
    ws_ticket_manager.reset()

    # Reconnect app singletons to isolated mock
    main.supabase = _GLOBAL_MOCK_SUPABASE
    main.repository = ChronosDomainRepository(_GLOBAL_MOCK_SUPABASE)
    main.meeting_service = MeetingTokenService(_GLOBAL_MOCK_SUPABASE)

    from storage.storage_service import set_storage_service, LocalStorageService
    from assessment.resource_service import ResourceService
    from assessment.answer_service import AnswerService
    from privacy.consent_service import ConsentService
    from privacy.legal_hold_service import LegalHoldService
    from privacy.retention_service import RetentionService
    from privacy.dsr_service import DSRService
    from auth.hms_verification import HMSComplianceVerifier

    mock_storage = LocalStorageService()
    set_storage_service(mock_storage)
    main.storage_service = mock_storage
    main.resource_service = ResourceService(repository=main.repository, storage_service=mock_storage)
    main.answer_service = AnswerService(repository=main.repository, storage_service=mock_storage)
    main.consent_service = ConsentService(repository=main.repository)
    main.legal_hold_service = LegalHoldService(repository=main.repository)
    main.retention_service = RetentionService(
        repository=main.repository,
        storage_service=mock_storage,
        legal_hold_service=main.legal_hold_service,
    )
    main.dsr_service = DSRService(repository=main.repository, retention_service=main.retention_service)
    main.hms_verifier = HMSComplianceVerifier()
    main.live_window_manager.set_repository(main.repository)

    set_jwt_validator(JWTValidator(jwt_secret=JWT_TEST_SECRET))


@pytest.fixture
def clock() -> DeterministicClock:
    return DeterministicClock()


@pytest.fixture
def id_gen() -> DeterministicIDGenerator:
    return DeterministicIDGenerator()


@pytest.fixture
def mock_supabase() -> MockSupabaseClient:
    return _GLOBAL_MOCK_SUPABASE


@pytest.fixture
def mock_db_client() -> MockSupabaseClient:
    return _GLOBAL_MOCK_SUPABASE


@pytest.fixture
def mock_hms() -> MockHMSClient:
    return MockHMSClient()


@pytest.fixture
def test_client():
    from fastapi.testclient import TestClient
    import main
    return TestClient(main.app)

