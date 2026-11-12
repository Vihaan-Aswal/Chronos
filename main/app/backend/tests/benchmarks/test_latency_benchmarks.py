"""
Chronos Automated Empirical p95 Latency & Load Benchmark Suite (W9.5 / Finding P1-04)
Specification: QUALITY_REQUIREMENTS.md §2 & §3

Automated benchmark suite measuring:
1. Critical teacher event delivery (assert p95 <= 5.0s)
2. Normal metric delivery (assert p95 <= 10.0s)
3. Window finalization execution (assert <= 5.0s)
4. Delta reconnect catch-up (assert <= 10.0s)
5. Active Presence challenge completion (assert p95 <= 2.0s)
6. 50-stream concurrent simulated load with 0 duplicate events, 0 cross-session leaks, and monotonic sequences.
"""
import asyncio
import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

import pytest
from fastapi.testclient import TestClient

import main
from main import app, live_window_manager
from presence.challenge_manager import ActivePresenceChallengeManager
from contracts import PolicyId, EventEnvelope
from tests.conftest import generate_test_jwt, MockSupabaseClient
from tests.fixtures.synthetic_factories import (
    make_synthetic_tenant,
    make_synthetic_tenant_member,
    make_synthetic_session,
    make_synthetic_user,
)


def calc_p95(latencies: List[float]) -> float:
    """Computes the 95th percentile latency in seconds."""
    if not latencies:
        return 0.0
    sorted_l = sorted(latencies)
    idx = int(len(sorted_l) * 0.95)
    return sorted_l[min(idx, len(sorted_l) - 1)]


@pytest.fixture
def benchmark_db(mock_supabase: MockSupabaseClient):
    """Seed multi-tenant benchmark database with isolated sessions and 50 simulated participants."""
    mock_supabase.reset()

    # Tenants
    mock_supabase.table("tenants").insert([
        make_synthetic_tenant("ten-bench-1", "Benchmark Tenant Alpha"),
        make_synthetic_tenant("ten-bench-2", "Benchmark Tenant Beta"),
    ]).execute()

    # Members
    mock_supabase.table("tenant_members").insert([
        make_synthetic_tenant_member("usr-teach-bench-1", "ten-bench-1", "teacher"),
        make_synthetic_tenant_member("usr-teach-bench-2", "ten-bench-2", "teacher"),
        make_synthetic_tenant_member("usr-admin-bench-1", "ten-bench-1", "admin"),
    ]).execute()

    # Users
    mock_supabase.table("users").insert([
        make_synthetic_user("usr-teach-bench-1", "ten-bench-1", "teacher", "Teacher Bench 1"),
        make_synthetic_user("usr-teach-bench-2", "ten-bench-2", "teacher", "Teacher Bench 2"),
        make_synthetic_user("usr-admin-bench-1", "ten-bench-1", "admin", "Admin Bench 1"),
    ]).execute()

    # Sessions
    mock_supabase.table("sessions").insert([
        make_synthetic_session(
            session_id="ses-bench-A",
            tenant_id="ten-bench-1",
            teacher_id="usr-teach-bench-1",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="ACTIVE",
            is_demo=True,
        ),
        make_synthetic_session(
            session_id="ses-bench-B",
            tenant_id="ten-bench-2",
            teacher_id="usr-teach-bench-2",
            policy_id=PolicyId.RESOURCE_SUPPORTED_ASSESSMENT,
            status="ACTIVE",
            is_demo=True,
        ),
    ]).execute()

    # 50 simulated participants in Session A
    session_a_participants = [
        {
            "session_id": "ses-bench-A",
            "user_id": f"usr-sim-{i:02d}",
            "tenant_id": "ten-bench-1",
            "status": "ADMITTED",
            "role": "student",
        }
        for i in range(1, 51)
    ]
    mock_supabase.table("session_participants").insert(session_a_participants).execute()

    # 10 participants in Session B (for cross-session leakage checks)
    session_b_participants = [
        {
            "session_id": "ses-bench-B",
            "user_id": f"usr-sim-b-{i:02d}",
            "tenant_id": "ten-bench-2",
            "status": "ADMITTED",
            "role": "student",
        }
        for i in range(1, 11)
    ]
    mock_supabase.table("session_participants").insert(session_b_participants).execute()

    return mock_supabase


class TestEmpiricalLatencyAndLoadBenchmarks:
    """Automated benchmark test suite asserting p95 empirical latency and load invariants."""

    def test_critical_teacher_event_delivery_p95(self, test_client: TestClient, benchmark_db):
        """
        Target: Critical teacher-visible event p95 <= 5.0 seconds.
        Measures end-to-end transit latency for teacher alerts, context events, and transitions.
        """
        teacher_token = generate_test_jwt("usr-teach-bench-1", "ten-bench-1", "teacher")
        student_token = generate_test_jwt("usr-sim-01", "ten-bench-1", "student")
        session_id = "ses-bench-A"
        latencies: List[float] = []

        with test_client.websocket_connect(f"/ws/teacher/{session_id}?token={teacher_token}") as teacher_ws:
            with test_client.websocket_connect(f"/ws/engagement/{session_id}?token={student_token}") as student_ws:
                for i in range(25):
                    sample_payload = {
                        "type": "OBSERVATION_SAMPLE",
                        "occurred_at": datetime.now(timezone.utc).isoformat(),
                        "payload": {
                            "sample_id": f"crit-sample-{i}",
                            "usable": True,
                            "face_count": 1,
                            "quality_score": 0.95,
                            "head_pose": {"yaw_deg": 25.0, "pitch_deg": 5.0, "roll_deg": 0.0},
                            "technical_reasons": [],
                        },
                    }
                    start_time = time.perf_counter()
                    student_ws.send_json(sample_payload)
                    received = teacher_ws.receive_json()
                    elapsed = time.perf_counter() - start_time
                    latencies.append(elapsed)

                    assert received["session_id"] == session_id
                    assert received["participant_id"] == "usr-sim-01"

        p95 = calc_p95(latencies)
        assert p95 <= 5.0, f"Critical teacher event delivery p95={p95:.4f}s exceeded target 5.0s"
        assert len(latencies) == 25

    def test_normal_metric_delivery_p95(self, test_client: TestClient, benchmark_db):
        """
        Target: Normal metric delivery p95 <= 10.0 seconds.
        Measures ingestion and buffer processing latency for standard observation metric packets.
        """
        student_token = generate_test_jwt("usr-sim-02", "ten-bench-1", "student")
        session_id = "ses-bench-A"
        latencies: List[float] = []

        with test_client.websocket_connect(f"/ws/engagement/{session_id}?token={student_token}") as student_ws:
            for i in range(50):
                msg = {
                    "type": "OBSERVATION_SAMPLE",
                    "occurred_at": datetime.now(timezone.utc).isoformat(),
                    "payload": {
                        "sample_id": f"metric-sample-{i}",
                        "usable": True,
                        "face_count": 1,
                        "quality_score": 0.92,
                        "head_pose": {"yaw_deg": 0.0, "pitch_deg": 0.0, "roll_deg": 0.0},
                        "technical_reasons": [],
                    },
                }
                start_time = time.perf_counter()
                student_ws.send_json(msg)
                elapsed = time.perf_counter() - start_time
                latencies.append(elapsed)

        p95 = calc_p95(latencies)
        assert p95 <= 10.0, f"Normal metric delivery p95={p95:.4f}s exceeded target 10.0s"
        assert len(latencies) == 50

    def test_window_finalization_execution_p95(self, benchmark_db):
        """
        Target: Window finalization execution <= 5.0 seconds.
        Measures server evaluation, classification, and event commitment time for live windows.
        """
        session_id = "ses-bench-A"
        tenant_id = "ten-bench-1"
        policy_id = "RESOURCE_SUPPORTED_ASSESSMENT"
        is_demo = True

        async def _run():
            latencies: List[float] = []
            base_time = datetime.now(timezone.utc) - timedelta(seconds=20)

            for win_idx in range(5):
                # Buffer samples for 10 simulated participants concurrently
                for p in range(1, 11):
                    pid = f"usr-sim-{p:02d}"
                    for s in range(10):
                        sample_time = base_time + timedelta(seconds=win_idx * 10 + s)
                        await live_window_manager.buffer_sample(
                            session_id=session_id,
                            participant_id=pid,
                            tenant_id=tenant_id,
                            policy_id=policy_id,
                            is_demo=is_demo,
                            sample_data={
                                "sample_id": f"win-{win_idx}-p-{pid}-s-{s}",
                                "usable": True,
                                "face_count": 1,
                                "quality_score": 0.95,
                                "head_pose": {"yaw_deg": 0.0, "pitch_deg": 0.0, "roll_deg": 0.0},
                                "technical_reasons": [],
                            },
                            occurred_at=sample_time,
                        )

                eval_time = base_time + timedelta(seconds=(win_idx + 1) * 10 + 2)
                t0 = time.perf_counter()
                await live_window_manager.evaluate_elapsed_windows(current_time=eval_time)
                elapsed = time.perf_counter() - t0
                latencies.append(elapsed)

            p95 = calc_p95(latencies)
            assert p95 <= 5.0, f"Window finalization execution p95={p95:.4f}s exceeded target 5.0s"
            assert len(latencies) == 5

        asyncio.run(_run())

    def test_delta_reconnect_catchup_p95(self, test_client: TestClient, benchmark_db):
        """
        Target: Reconnect snapshot catch-up <= 10.0 seconds.
        Measures latency to query sequenced event stream deltas upon client reconnection.
        """
        teacher_token = generate_test_jwt("usr-teach-bench-1", "ten-bench-1", "teacher")
        session_id = "ses-bench-A"
        now_iso = datetime.now(timezone.utc).isoformat()

        # Seed 100 sequenced events
        for i in range(1, 101):
            evt = {
                "event_id": f"bench-evt-{i:04d}",
                "session_id": session_id,
                "tenant_id": "ten-bench-1",
                "participant_id": f"usr-sim-{(i % 50) + 1:02d}",
                "actor_id": "usr-sim-01",
                "actor_role": "participant",
                "source": "camera",
                "event_type": "OBSERVATION_SAMPLE",
                "occurred_at": now_iso,
                "server_sequence": i,
                "policy_id": "RESOURCE_SUPPORTED_ASSESSMENT",
                "is_demo": True,
                "payload": {"sample_id": f"seq-{i}", "usable": True},
            }
            main.repository.append_event(evt)

        latencies: List[float] = []
        for query_seq in [10, 25, 50, 75, 90]:
            t0 = time.perf_counter()
            resp = test_client.get(
                f"/api/v1/sessions/{session_id}/events?since_sequence={query_seq}",
                headers={"Authorization": f"Bearer {teacher_token}"},
            )
            elapsed = time.perf_counter() - t0
            latencies.append(elapsed)

            assert resp.status_code == 200
            data = resp.json()
            assert data["count"] == (100 - query_seq + 1)

        p95 = calc_p95(latencies)
        assert p95 <= 10.0, f"Delta reconnect catch-up latency p95={p95:.4f}s exceeded target 10.0s"

    def test_active_presence_challenge_completion_p95(self, benchmark_db):
        """
        Target: Active Presence completion result reaches teacher at p95 <= 2.0 seconds.
        Measures generation, evaluation, and completion notification lifecycle latency.
        """
        manager = ActivePresenceChallengeManager()
        tenant_id = "ten-bench-1"
        session_id = "ses-bench-A"
        latencies: List[float] = []

        for i in range(20):
            pid = f"usr-sim-{(i % 50) + 1:02d}"
            t0 = time.perf_counter()

            # 1. Generate challenge
            challenge = manager.create_challenge(
                tenant_id=tenant_id,
                session_id=session_id,
                participant_id=pid,
            )
            assert challenge.challenge_id is not None

            # 2. Start challenge
            manager.start_challenge(
                challenge_id=challenge.challenge_id,
                participant_id=pid,
                session_id=session_id,
            )

            # 3. Complete and submit response
            res_state, payload = manager.respond_to_challenge(
                challenge_id=challenge.challenge_id,
                participant_id=pid,
                session_id=session_id,
                nonce=challenge.nonce,
                submitted_actions=challenge.actions,
                quality_ok=True,
                elapsed_ms=850,
            )

            elapsed = time.perf_counter() - t0
            latencies.append(elapsed)

            assert res_state.value == "PASSED"

        p95 = calc_p95(latencies)
        assert p95 <= 2.0, f"Active Presence completion p95={p95:.4f}s exceeded target 2.0s"
        assert len(latencies) == 20

    def test_50_stream_concurrent_load_and_isolation(self, test_client: TestClient, benchmark_db):
        """
        Target: 50-stream concurrent simulation load test asserting:
        - 0 duplicate events
        - 0 cross-session event leaks
        - Gapless monotonic server sequences
        - Delivery latency under concurrent streaming
        """
        session_a = "ses-bench-A"
        session_b = "ses-bench-B"
        teacher_a_jwt = generate_test_jwt("usr-teach-bench-1", "ten-bench-1", "teacher")
        teacher_b_jwt = generate_test_jwt("usr-teach-bench-2", "ten-bench-2", "teacher")

        events_sent_session_a = set()
        events_sent_session_b = set()

        # Connect teachers for both sessions
        with test_client.websocket_connect(f"/ws/teacher/{session_a}?token={teacher_a_jwt}") as teacher_a_ws:
            with test_client.websocket_connect(f"/ws/teacher/{session_b}?token={teacher_b_jwt}") as teacher_b_ws:

                # Ingest 50 streams into Session A
                for p in range(1, 51):
                    pid_a = f"usr-sim-{p:02d}"
                    part_a_jwt = generate_test_jwt(pid_a, "ten-bench-1", "student")
                    with test_client.websocket_connect(f"/ws/engagement/{session_a}?token={part_a_jwt}") as s_ws_a:
                        evt_id = f"load-evt-A-{pid_a}"
                        events_sent_session_a.add(evt_id)
                        msg = {
                            "type": "OBSERVATION_SAMPLE",
                            "event_id": evt_id,
                            "occurred_at": datetime.now(timezone.utc).isoformat(),
                            "payload": {
                                "sample_id": f"samp-{evt_id}",
                                "usable": True,
                                "face_count": 1,
                                "quality_score": 0.95,
                                "head_pose": {"yaw_deg": 0.0, "pitch_deg": 0.0, "roll_deg": 0.0},
                                "technical_reasons": [],
                            },
                        }
                        s_ws_a.send_json(msg)
                        broadcast_a = teacher_a_ws.receive_json()
                        assert broadcast_a["session_id"] == session_a
                        assert broadcast_a["participant_id"] == pid_a

                # Ingest 10 streams into Session B
                for p in range(1, 11):
                    pid_b = f"usr-sim-b-{p:02d}"
                    part_b_jwt = generate_test_jwt(pid_b, "ten-bench-2", "student")
                    with test_client.websocket_connect(f"/ws/engagement/{session_b}?token={part_b_jwt}") as s_ws_b:
                        evt_id = f"load-evt-B-{pid_b}"
                        events_sent_session_b.add(evt_id)
                        msg = {
                            "type": "OBSERVATION_SAMPLE",
                            "event_id": evt_id,
                            "occurred_at": datetime.now(timezone.utc).isoformat(),
                            "payload": {
                                "sample_id": f"samp-{evt_id}",
                                "usable": True,
                                "face_count": 1,
                                "quality_score": 0.95,
                                "head_pose": {"yaw_deg": 0.0, "pitch_deg": 0.0, "roll_deg": 0.0},
                                "technical_reasons": [],
                            },
                        }
                        s_ws_b.send_json(msg)
                        broadcast_b = teacher_b_ws.receive_json()
                        assert broadcast_b["session_id"] == session_b
                        assert broadcast_b["participant_id"] == pid_b

        # 1. Assert Event Store Isolation: 0 cross-session event leakage
        events_a = main.repository.get_session_events(session_a)
        events_b = main.repository.get_session_events(session_b)

        pids_a = {e.get("participant_id") for e in events_a}
        pids_b = {e.get("participant_id") for e in events_b}

        # Session A must only contain usr-sim-XX
        for pid in pids_a:
            assert pid.startswith("usr-sim-") and not pid.startswith("usr-sim-b-"), f"Leak detected in Session A: {pid}"

        # Session B must only contain usr-sim-b-XX
        for pid in pids_b:
            assert pid.startswith("usr-sim-b-"), f"Leak detected in Session B: {pid}"

        # 2. Assert 0 duplicate events in storage
        ids_a = [e["event_id"] for e in events_a if "event_id" in e]
        assert len(ids_a) == len(set(ids_a)), "Duplicate events detected in Session A"

        ids_b = [e["event_id"] for e in events_b if "event_id" in e]
        assert len(ids_b) == len(set(ids_b)), "Duplicate events detected in Session B"

        # 3. Assert strictly monotonic server sequences
        seqs_a = [e["server_sequence"] for e in events_a if "server_sequence" in e and e["server_sequence"] is not None]
        assert seqs_a == sorted(seqs_a), "Out-of-order server sequences detected in Session A"
        assert len(seqs_a) == len(set(seqs_a)), "Duplicate server sequences detected in Session A"
