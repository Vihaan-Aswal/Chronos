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
                if "id" not in row and "session_id" not in row and "user_id" not in row:
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
                    # Composite key check for session_participants (session_id, user_id)
                    if "session_id" in row and "user_id" in row:
                        if (
                            existing.get("session_id") == row["session_id"]
                            and existing.get("user_id") == row["user_id"]
                        ):
                            match_idx = idx
                            break
                    if "id" in row and existing.get("id") == row["id"]:
                        match_idx = idx
                        break
                    if "session_id" in row and existing.get("session_id") == row["session_id"]:
                        match_idx = idx
                        break
                    if "user_id" in row and existing.get("user_id") == row["user_id"]:
                        match_idx = idx
                        break
                if match_idx is not None:
                    table_rows[match_idx].update(row)
                    saved.append(table_rows[match_idx])
                else:
                    if "id" not in row and "user_id" not in row and "session_id" not in row:
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

        if self._order_col:
            filtered = sorted(
                filtered,
                key=lambda x: str(x.get(self._order_col, "")),
                reverse=self._order_desc,
            )

        if self._limit_val:
            filtered = filtered[: self._limit_val]

        return MockResponse(data=filtered)


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
            "cases": [],
            "resources": [],
            "answers": [],
            "consents": [],
            "identity_embeddings": [],
            "session_analytics": [],
        }

    def table(self, name: str) -> MockTableQueryBuilder:
        return MockTableQueryBuilder(name, self.store)

    def reset(self):
        for k in self.store:
            self.store[k].clear()


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
def mock_hms() -> MockHMSClient:
    return MockHMSClient()
