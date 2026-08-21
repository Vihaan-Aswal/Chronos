"""
Integration tests for Live In-Flight Server-Side Window Finalization Loop (P1-02, W3.3, W4.3).
Verifies that streaming observation samples over WebSockets triggers live window finalization,
commits WINDOW_FINALIZED events into durable storage, and broadcasts state transitions to teacher sockets.
"""
import asyncio
import time
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

import main
from main import app, live_window_manager
from tests.conftest import generate_test_jwt, MockSupabaseClient
from tests.fixtures.synthetic_factories import (
    make_synthetic_tenant,
    make_synthetic_tenant_member,
    make_synthetic_session,
)


@pytest.fixture
def live_window_db(mock_supabase: MockSupabaseClient):
    mock_supabase.reset()

    # Tenants
    mock_supabase.table("tenants").insert([
        make_synthetic_tenant("ten-live-1", "Tenant Live Test"),
    ]).execute()

    # Members
    mock_supabase.table("tenant_members").insert([
        make_synthetic_tenant_member("usr-teach-live", "ten-live-1", "teacher"),
        make_synthetic_tenant_member("usr-stud-live", "ten-live-1", "student"),
    ]).execute()

    # Session (Demo clock: 10s windows)
    mock_supabase.table("sessions").insert([
        make_synthetic_session(
            session_id="ses-live-demo-1",
            tenant_id="ten-live-1",
            teacher_id="usr-teach-live",
            status="ACTIVE",
            policy_id="RESOURCE_SUPPORTED_ASSESSMENT",
            is_demo=True,
        ),
    ]).execute()

    # Session Participants
    mock_supabase.table("session_participants").insert([
        {
            "session_id": "ses-live-demo-1",
            "user_id": "usr-stud-live",
            "tenant_id": "ten-live-1",
            "status": "ADMITTED",
            "role": "student",
        },
    ]).execute()

    return mock_supabase


def test_live_window_manager_sample_buffering_and_finalization(live_window_db):
    """Test that LiveWindowManager buffers samples and finalizes windows when time elapses."""
    async def _run():
        session_id = "ses-live-demo-1"
        participant_id = "usr-stud-live"
        tenant_id = "ten-live-1"
        policy_id = "RESOURCE_SUPPORTED_ASSESSMENT"
        is_demo = True

        base_time = datetime.now(timezone.utc) - timedelta(seconds=15)

        # 1. Buffer 10 usable clean samples covering the 10s window
        for i in range(10):
            sample_time = base_time + timedelta(seconds=i)
            sample = {
                "sample_id": f"samp-live-{i}",
                "usable": True,
                "face_count": 1,
                "quality_score": 0.95,
                "head_pose": {"yaw_deg": 0.0, "pitch_deg": 0.0, "roll_deg": 0.0},
                "technical_reasons": [],
                "is_page_hidden": False,
            }
            await live_window_manager.buffer_sample(
                session_id=session_id,
                participant_id=participant_id,
                tenant_id=tenant_id,
                policy_id=policy_id,
                is_demo=is_demo,
                sample_data=sample,
                occurred_at=sample_time,
            )

        # 2. Trigger elapsed window evaluation at current time
        now_eval = base_time + timedelta(seconds=12)  # Window ended at base_time+10s + 0.5s grace
        await live_window_manager.evaluate_elapsed_windows(current_time=now_eval)

        # 3. Verify WINDOW_FINALIZED event was committed to durable repository
        events = main.repository.get_session_events(session_id)
        finalized_events = [e for e in events if e.get("event_type") == "WINDOW_FINALIZED"]
        assert len(finalized_events) >= 1

        final_evt = finalized_events[0]
        payload = final_evt.get("payload", {})
        assert payload.get("observation_state") == "VALID"
        assert payload.get("classification") == "VALID_CLEAN"
        assert payload.get("expected_segments") == 10
        assert payload.get("usable_segments") == 10
        assert payload.get("clean_streak") == 1

        # 4. Verify participant projection was updated
        proj = main.repository.get_participant_projection(session_id, participant_id)
        assert proj is not None
        assert proj["observation_state"] == "OBSERVABLE"
        assert proj["clean_streak"] == 1

    asyncio.run(_run())


def test_websocket_streaming_ingests_and_buffers_live(live_window_db):
    """Test full WebSocket streaming flow: student streams samples, teacher receives live messages."""
    client = TestClient(app)
    session_id = "ses-live-demo-1"

    student_token = generate_test_jwt("usr-stud-live", "ten-live-1", "student")
    teacher_token = generate_test_jwt("usr-teach-live", "ten-live-1", "teacher")

    # Connect teacher
    with client.websocket_connect(f"/ws/teacher/{session_id}?token={teacher_token}") as teacher_ws:
        # Connect student
        with client.websocket_connect(f"/ws/engagement/{session_id}?token={student_token}") as student_ws:
            sample_msg = {
                "type": "OBSERVATION_SAMPLE",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "sample_id": "samp-ws-test-1",
                    "usable": True,
                    "face_count": 1,
                    "quality_score": 0.92,
                    "head_pose": {"yaw_deg": 0.0, "pitch_deg": 0.0, "roll_deg": 0.0},
                    "technical_reasons": [],
                },
            }
            student_ws.send_json(sample_msg)

            # Teacher receives forwarded live broadcast
            received = teacher_ws.receive_json()
            assert received["session_id"] == session_id
            assert received["participant_id"] == "usr-stud-live"
