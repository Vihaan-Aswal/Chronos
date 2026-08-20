"""
Chronos Workstream W2: Domain Contracts and Event Persistence Test Suite
Comprehensive contract, persistence, idempotency, isolation, and projection rebuild tests.
"""
import os
import uuid
import pytest
from typing import Dict, Any
from fastapi.testclient import TestClient

from contracts import EventEnvelope, EventType, PolicyId, ActorRole, EventSource
from projections.engine import ProjectionEngine
from repository import ChronosDomainRepository
from tests.fixtures.event_factories import (
    make_event_envelope,
    make_synthetic_observation_sample_payload,
    make_synthetic_window_finalized_payload,
    make_synthetic_presence_challenge_payload,
    make_synthetic_browser_visibility_payload,
    make_synthetic_resource_payload,
    make_synthetic_answer_payload,
    make_synthetic_case_payload,
)
from tests.fixtures.synthetic_factories import make_synthetic_session
from tests.conftest import MockEventStore, MockSupabaseClient, generate_test_jwt
from main import app


@pytest.mark.contract
class TestW2DomainContractsAndPersistence:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    # -----------------------------------------------------------------------
    # 1. Valid & Invalid Envelopes
    # -----------------------------------------------------------------------

    def test_canonical_envelope_valid(self, clock, id_gen):
        """ENV-01: Canonical valid envelope creates valid Pydantic model and serialized dict."""
        evt = make_event_envelope(
            event_id=id_gen.next_uuid("evt"),
            event_type="WINDOW_FINALIZED",
            tenant_id="ten-0001",
            session_id="ses-0001",
            participant_id="usr-student-001",
            actor_id="usr-student-001",
            actor_role="participant",
            source="server",
            occurred_at=clock.now_iso(),
            received_at=clock.now_iso(),
            server_sequence=1,
            policy_id="RESOURCE_SUPPORTED_ASSESSMENT",
            policy_version="v1",
            is_demo=False,
            payload=make_synthetic_window_finalized_payload(),
        )

        model = EventEnvelope(**evt)
        assert model.event_id == evt["event_id"]
        assert model.schema_version == 1
        assert model.is_demo is False
        assert model.server_sequence == 1
        assert isinstance(model.payload, dict)

    def test_invalid_envelope_missing_scope(self, clock, id_gen):
        """ENV-02: Missing required scope fields raises validation error."""
        with pytest.raises(Exception):
            EventEnvelope(
                event_id=id_gen.next_uuid("evt"),
                event_type="OBSERVATION_SAMPLE",
                # missing tenant_id and session_id
                actor_id="usr-1",
                actor_role="participant",
                source="browser",
                occurred_at=clock.now_iso(),
                policy_id="CLASSROOM",
            )

    # -----------------------------------------------------------------------
    # 2. Prohibited Sensitive Payload Rejection
    # -----------------------------------------------------------------------

    def test_prohibited_raw_frames_rejected(self, clock, id_gen):
        """PRV-01: Prohibited raw camera frames rejected from event envelope."""
        with pytest.raises(ValueError, match="Prohibited sensitive field 'raw_frame'"):
            EventEnvelope(
                event_id=id_gen.next_uuid("evt"),
                event_type="OBSERVATION_SAMPLE",
                tenant_id="ten-0001",
                session_id="ses-0001",
                participant_id="usr-001",
                actor_id="usr-001",
                actor_role="participant",
                source="camera",
                occurred_at=clock.now_iso(),
                policy_id="CLASSROOM",
                payload={"raw_frame": "data:image/jpeg;base64,..."},
            )

    def test_prohibited_continuous_landmarks_rejected(self, clock, id_gen):
        """PRV-02: Continuous biometric landmarks rejected from event envelope."""
        with pytest.raises(ValueError, match="Prohibited sensitive field 'landmarks'"):
            EventEnvelope(
                event_id=id_gen.next_uuid("evt"),
                event_type="OBSERVATION_SAMPLE",
                tenant_id="ten-0001",
                session_id="ses-0001",
                participant_id="usr-001",
                actor_id="usr-001",
                actor_role="participant",
                source="camera",
                occurred_at=clock.now_iso(),
                policy_id="CLASSROOM",
                payload={"landmarks": [[0.1, 0.2, 0.3]] * 468},
            )

    def test_prohibited_embeddings_in_telemetry_rejected(self, clock, id_gen):
        """PRV-03: Continuous embeddings rejected from event envelope."""
        with pytest.raises(ValueError, match="Prohibited sensitive field 'embedding'"):
            EventEnvelope(
                event_id=id_gen.next_uuid("evt"),
                event_type="OBSERVATION_SAMPLE",
                tenant_id="ten-0001",
                session_id="ses-0001",
                participant_id="usr-001",
                actor_id="usr-001",
                actor_role="participant",
                source="browser",
                occurred_at=clock.now_iso(),
                policy_id="CLASSROOM",
                payload={"embedding": [0.05] * 128},
            )

    def test_prohibited_secrets_rejected(self, clock, id_gen):
        """PRV-04: Secrets, tokens, and passwords rejected from event envelope."""
        with pytest.raises(ValueError, match="Prohibited sensitive field 'jwt_token'"):
            EventEnvelope(
                event_id=id_gen.next_uuid("evt"),
                event_type="OBSERVATION_SAMPLE",
                tenant_id="ten-0001",
                session_id="ses-0001",
                participant_id="usr-001",
                actor_id="usr-001",
                actor_role="participant",
                source="browser",
                occurred_at=clock.now_iso(),
                policy_id="CLASSROOM",
                payload={"jwt_token": "eyJhbGciOi..."},
            )

    # -----------------------------------------------------------------------
    # 3. Actor & Source Validation (REST Endpoint)
    # -----------------------------------------------------------------------

    def test_student_cannot_emit_teacher_action(self, client, mock_supabase, clock, id_gen):
        """ACT-01: Student attempting to ingest TEACHER_ACTION_RECORDED is rejected with 403."""
        tenant_id = "ten-0001"
        session_id = "ses-act-01"
        student_id = "usr-student-001"

        # Setup synthetic session
        mock_supabase.store["sessions"].append({
            "session_id": session_id,
            "id": session_id,
            "tenant_id": tenant_id,
            "teacher_id": "usr-teacher-001",
            "is_demo": False,
            "status": "ACTIVE",
        })

        token = generate_test_jwt(user_id=student_id, tenant_id=tenant_id, role="student")
        payload = make_event_envelope(
            event_id=id_gen.next_uuid("evt"),
            event_type="TEACHER_ACTION_RECORDED",
            tenant_id=tenant_id,
            session_id=session_id,
            participant_id=student_id,
            actor_id=student_id,
            actor_role="participant",
            source="browser",
            occurred_at=clock.now_iso(),
            policy_id="CLASSROOM",
        )

        resp = client.post(
            "/api/v1/events/ingest",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
        assert "Unauthorized event type for participant" in resp.json()["detail"]

    def test_student_cannot_forge_different_actor_id(self, client, mock_supabase, clock, id_gen):
        """ACT-02: Student attempting to forge another actor_id is rejected with 403."""
        tenant_id = "ten-0001"
        session_id = "ses-act-02"
        student_id = "usr-student-001"

        mock_supabase.store["sessions"].append({
            "session_id": session_id,
            "id": session_id,
            "tenant_id": tenant_id,
            "teacher_id": "usr-teacher-001",
            "is_demo": False,
            "status": "ACTIVE",
        })

        token = generate_test_jwt(user_id=student_id, tenant_id=tenant_id, role="student")
        payload = make_event_envelope(
            event_id=id_gen.next_uuid("evt"),
            event_type="OBSERVATION_SAMPLE",
            tenant_id=tenant_id,
            session_id=session_id,
            participant_id=student_id,
            actor_id="usr-student-999",  # Forged actor ID
            actor_role="participant",
            source="browser",
            occurred_at=clock.now_iso(),
            policy_id="CLASSROOM",
            payload=make_synthetic_observation_sample_payload(),
        )

        resp = client.post(
            "/api/v1/events/ingest",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
        assert "Actor ID does not match" in resp.json()["detail"]

    # -----------------------------------------------------------------------
    # 4. Duplicate Event Submission & Idempotency
    # -----------------------------------------------------------------------

    def test_duplicate_event_idempotency(self, mock_supabase, clock, id_gen):
        """IDEM-01: Duplicate event_id returns existing event without creating duplicate rows."""
        repo = ChronosDomainRepository(mock_supabase)
        evt_id = id_gen.next_uuid("evt")
        session_id = "ses-idem-01"

        event_data = make_event_envelope(
            event_id=evt_id,
            session_id=session_id,
            tenant_id="ten-0001",
            participant_id="usr-student-001",
            event_type="WINDOW_FINALIZED",
            server_sequence=None,
            occurred_at=clock.now_iso(),
            payload=make_synthetic_window_finalized_payload(classification="VALID_CLEAN"),
        )

        # 1st append
        p1 = repo.append_event(dict(event_data))
        assert p1["event_id"] == evt_id
        assert p1["server_sequence"] == 1

        # 2nd append with exact same event_id
        p2 = repo.append_event(dict(event_data))
        assert p2["event_id"] == evt_id
        assert p2["server_sequence"] == 1

        # Verify only 1 event exists in storage
        events = repo.get_session_events(session_id)
        assert len(events) == 1

    # -----------------------------------------------------------------------
    # 5. Monotonic Sequence Allocation & Out-of-Order Handling
    # -----------------------------------------------------------------------

    def test_monotonic_sequence_allocation(self, mock_supabase, clock, id_gen):
        """ORD-01: Successive events receive strictly increasing gapless sequences."""
        repo = ChronosDomainRepository(mock_supabase)
        session_id = "ses-ord-01"

        seqs = []
        for i in range(5):
            evt = make_event_envelope(
                event_id=id_gen.next_uuid("evt"),
                session_id=session_id,
                tenant_id="ten-0001",
                participant_id="usr-student-001",
                event_type="OBSERVATION_SAMPLE",
                server_sequence=None,
                occurred_at=clock.now_iso(),
                payload=make_synthetic_observation_sample_payload(sample_index=i),
            )
            persisted = repo.append_event(evt)
            seqs.append(persisted["server_sequence"])

        assert seqs == [1, 2, 3, 4, 5]

    # -----------------------------------------------------------------------
    # 6. Cross-Session & Cross-Tenant Rejection
    # -----------------------------------------------------------------------

    def test_cross_tenant_event_rejection(self, client, mock_supabase, clock, id_gen):
        """ISO-01: Ingesting event for a session belonging to another tenant is denied (404)."""
        session_id = "ses-iso-01"
        mock_supabase.store["sessions"].append({
            "session_id": session_id,
            "id": session_id,
            "tenant_id": "ten-tenant-A",
            "teacher_id": "usr-teacher-A",
            "is_demo": False,
            "status": "ACTIVE",
        })

        # Caller in Tenant B
        token_b = generate_test_jwt(user_id="usr-b-1", tenant_id="ten-tenant-B", role="student")
        payload = make_event_envelope(
            event_id=id_gen.next_uuid("evt"),
            session_id=session_id,
            tenant_id="ten-tenant-B",
            participant_id="usr-b-1",
            actor_id="usr-b-1",
            actor_role="participant",
            source="browser",
            event_type="OBSERVATION_SAMPLE",
            occurred_at=clock.now_iso(),
            policy_id="CLASSROOM",
            payload=make_synthetic_observation_sample_payload(),
        )

        resp = client.post(
            "/api/v1/events/ingest",
            json=payload,
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert resp.status_code == 404

    # -----------------------------------------------------------------------
    # 7. Demo / Live Mixing Rejection
    # -----------------------------------------------------------------------

    def test_demo_event_in_live_session_rejected(self, client, mock_supabase, clock, id_gen):
        """DEMO-01: is_demo=True event submitted to is_demo=False session is rejected with 422."""
        session_id = "ses-live-01"
        tenant_id = "ten-0001"
        mock_supabase.store["sessions"].append({
            "session_id": session_id,
            "id": session_id,
            "tenant_id": tenant_id,
            "teacher_id": "usr-teacher-001",
            "is_demo": False,  # LIVE SESSION
            "status": "ACTIVE",
        })

        token = generate_test_jwt(user_id="usr-student-001", tenant_id=tenant_id, role="student")
        payload = make_event_envelope(
            event_id=id_gen.next_uuid("evt"),
            session_id=session_id,
            tenant_id=tenant_id,
            participant_id="usr-student-001",
            actor_id="usr-student-001",
            actor_role="participant",
            source="browser",
            event_type="OBSERVATION_SAMPLE",
            occurred_at=clock.now_iso(),
            policy_id="CLASSROOM",
            is_demo=True,  # DEMO FLAG MISMATCH
            payload=make_synthetic_observation_sample_payload(),
        )

        resp = client.post(
            "/api/v1/events/ingest",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422
        assert "Demo/live mixing mismatch" in resp.json()["detail"]

    # -----------------------------------------------------------------------
    # 8. Projection Rebuild Equivalence
    # -----------------------------------------------------------------------

    def test_projection_rebuild_deterministic_equivalence(self, clock, id_gen):
        """PROJ-01: Replaying raw event stream produces 100% field equivalence with incremental stream."""
        participant_id = "usr-student-001"
        session_id = "ses-proj-eq"

        events = []
        # Event 1: Join
        events.append(make_event_envelope(
            event_id=id_gen.next_uuid("evt"),
            event_type="PARTICIPANT_JOINED",
            session_id=session_id,
            participant_id=participant_id,
            server_sequence=1,
            occurred_at="2026-08-20T10:00:00Z",
        ))

        # Events 2-4: 3 consecutive warning windows -> SUSTAINED_CONCERN
        for i in range(1, 4):
            events.append(make_event_envelope(
                event_id=id_gen.next_uuid("evt"),
                event_type="WINDOW_FINALIZED",
                session_id=session_id,
                participant_id=participant_id,
                server_sequence=1 + i,
                occurred_at=f"2026-08-20T10:0{i}:00Z",
                payload=make_synthetic_window_finalized_payload(
                    classification="VALID_WARNING",
                    warning_streak=i,
                ),
            ))

        # Event 5: Active Presence Passed (must NOT alter attention score/streak)
        events.append(make_event_envelope(
            event_id=id_gen.next_uuid("evt"),
            event_type="ACTIVE_PRESENCE_PASSED",
            session_id=session_id,
            participant_id=participant_id,
            server_sequence=5,
            occurred_at="2026-08-20T10:04:00Z",
        ))

        # Events 6-7: 2 clean windows -> STABLE recovery
        for i in range(1, 3):
            events.append(make_event_envelope(
                event_id=id_gen.next_uuid("evt"),
                event_type="WINDOW_FINALIZED",
                session_id=session_id,
                participant_id=participant_id,
                server_sequence=5 + i,
                occurred_at=f"2026-08-20T10:0{4+i}:00Z",
                payload=make_synthetic_window_finalized_payload(
                    classification="VALID_CLEAN",
                    clean_streak=i,
                ),
            ))

        # 1. Batch Rebuild from raw event log
        batch_projection = ProjectionEngine.build_participant_projection(events, participant_id, session_id)

        # 2. Incremental Projection (one-by-one step reduction)
        incremental_projection = {}
        for idx in range(1, len(events) + 1):
            incremental_projection = ProjectionEngine.build_participant_projection(events[:idx], participant_id, session_id)

        # 100% field equivalence assertion
        assert batch_projection == incremental_projection
        assert batch_projection["clean_streak"] == 2
        assert batch_projection["warning_streak"] == 0
        assert batch_projection["attention_pattern"] == "STABLE"
        assert batch_projection["case_state"] == "RESOLVED"
        assert batch_projection["active_presence_state"] == "PASSED"

    # -----------------------------------------------------------------------
    # 9. Reconnect Catch-up Query
    # -----------------------------------------------------------------------

    def test_reconnect_sync_queries_events_since_sequence(self, client, mock_supabase, clock, id_gen):
        """SYNC-01: Reconnecting client queries event stream since given sequence number."""
        session_id = "ses-reconnect-01"
        tenant_id = "ten-0001"
        teacher_id = "usr-teacher-001"

        mock_supabase.store["sessions"].append({
            "session_id": session_id,
            "id": session_id,
            "tenant_id": tenant_id,
            "teacher_id": teacher_id,
            "is_demo": False,
            "status": "ACTIVE",
        })

        repo = ChronosDomainRepository(mock_supabase)
        for i in range(1, 6):
            repo.append_event(make_event_envelope(
                event_id=id_gen.next_uuid("evt"),
                session_id=session_id,
                tenant_id=tenant_id,
                participant_id="usr-student-001",
                event_type="OBSERVATION_SAMPLE",
                server_sequence=i,
                occurred_at=clock.now_iso(),
                payload=make_synthetic_observation_sample_payload(sample_index=i),
            ))

        token = generate_test_jwt(user_id=teacher_id, tenant_id=tenant_id, role="teacher")
        resp = client.get(
            f"/api/v1/sessions/{session_id}/events?since_sequence=3",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 3
        seqs = [e["server_sequence"] for e in data["events"]]
        assert seqs == [3, 4, 5]

    # -----------------------------------------------------------------------
    # 10. Database Migration Forward and Rollback SQL Verification
    # -----------------------------------------------------------------------

    def test_migration_sql_files_exist_and_valid(self):
        """MIG-01: Forward and rollback migration scripts exist and contain required DDL."""
        migrations_dir = os.path.join(
            os.path.dirname(__file__), "..", "..", "migrations"
        )
        fwd_file = os.path.join(migrations_dir, "002_durable_events_and_projections.sql")
        rollback_file = os.path.join(migrations_dir, "002_rollback.sql")

        assert os.path.exists(fwd_file), "Forward migration 002 file missing"
        assert os.path.exists(rollback_file), "Rollback migration 002 file missing"

        with open(fwd_file, "r", encoding="utf-8") as f:
            fwd_sql = f.read()

        with open(rollback_file, "r", encoding="utf-8") as f:
            rollback_sql = f.read()

        assert "session_events" in fwd_sql
        assert "participant_projections" in fwd_sql
        assert "finalized_windows" in fwd_sql
        assert "prevent_session_event_modification" in fwd_sql

        assert "DROP TABLE IF EXISTS session_events" in rollback_sql
        assert "DROP TABLE IF EXISTS participant_projections" in rollback_sql
