"""
Chronos Active Presence Protocol, Security & Lifecycle Test Suite
Workstream W4: Local Observation, Browser Context, and Active Presence
Specifications: LOGIC_AND_EVENT_SPEC.md §6, QUALITY_REQUIREMENTS.md §3, PRIVACY_DATA_MODEL.md §7
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from fastapi.testclient import TestClient

from contracts import EventEnvelope, EventType, ActivePresenceState, PolicyId
from presence import (
    challenge_manager,
    ActivePresenceChallengeManager,
    ActivePresenceChallenge,
    ActivePresenceResultState,
)
from projections.engine import ProjectionEngine
from tests.fixtures.synthetic_factories import make_synthetic_session
from tests.conftest import MockEventStore, MockSupabaseClient, generate_test_jwt
from main import app


@pytest.fixture(autouse=True)
def reset_presence_state():
    """Ensure clean challenge manager state for every test."""
    challenge_manager.reset_state_for_tests()
    yield
    challenge_manager.reset_state_for_tests()


@pytest.mark.unit
class TestActivePresenceChallengeManager:
    """Unit tests for Active Presence Challenge lifecycle, sequences, and cooldowns."""

    def test_compatible_action_selection(self):
        """Action pool must select 2 compatible actions with no duplicates or opposing pairs."""
        manager = ActivePresenceChallengeManager()
        for _ in range(50):
            actions = manager.select_compatible_actions()
            assert len(actions) == 2
            assert actions[0] != actions[1]
            assert (actions[0], actions[1]) not in {
                ("TURN_LEFT", "TURN_RIGHT"),
                ("TURN_RIGHT", "TURN_LEFT"),
                ("LOOK_UP", "LOOK_DOWN"),
                ("LOOK_DOWN", "LOOK_UP"),
            }
            assert manager.validate_action_sequence(actions) is True

    def test_challenge_creation_and_binding(self):
        """Challenge must bind tenant, session, participant, challenge_id, nonce, and 15s expiry."""
        now = datetime.now(timezone.utc)
        ch = challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-001",
            participant_id="usr-stu-001",
            trigger="join",
            policy_id="CLASSROOM",
            now=now,
        )
        assert ch.challenge_id is not None
        assert ch.nonce is not None
        assert len(ch.nonce) >= 16
        assert ch.tenant_id == "ten-001"
        assert ch.session_id == "ses-001"
        assert ch.participant_id == "usr-stu-001"
        assert ch.status == ActivePresenceResultState.REQUESTED
        assert (ch.expires_at - ch.issued_at).total_seconds() == 15
        assert ch.is_expired is False

    def test_challenge_expiry_enforcement(self):
        """Submissions after 15s expiry must transition to TIMED_OUT."""
        t0 = datetime.now(timezone.utc)
        ch = challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-001",
            participant_id="usr-stu-001",
            now=t0,
        )

        t_expired = t0 + timedelta(seconds=16)
        state, result = challenge_manager.respond_to_challenge(
            challenge_id=ch.challenge_id,
            participant_id="usr-stu-001",
            session_id="ses-001",
            nonce=ch.nonce,
            submitted_actions=ch.actions,
            now=t_expired,
        )
        assert state == ActivePresenceResultState.TIMED_OUT
        assert result["status"] == "TIMED_OUT"

    def test_attempt_exhaustion_quality_fail(self):
        """Attempt 1 quality fail requires retry; attempt 2 quality fail transitions to QUALITY_FAIL."""
        now = datetime.now(timezone.utc)
        ch = challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-001",
            participant_id="usr-stu-001",
            now=now,
        )

        # Attempt 1: quality failure -> RETRY_REQUIRED
        state1, res1 = challenge_manager.respond_to_challenge(
            challenge_id=ch.challenge_id,
            participant_id="usr-stu-001",
            session_id="ses-001",
            nonce=ch.nonce,
            submitted_actions=ch.actions,
            quality_ok=False,
            now=now,
        )
        assert state1 == ActivePresenceResultState.RETRY_REQUIRED
        assert res1["attempt_number"] == 2

        # Attempt 2: quality failure -> QUALITY_FAIL
        state2, res2 = challenge_manager.respond_to_challenge(
            challenge_id=ch.challenge_id,
            participant_id="usr-stu-001",
            session_id="ses-001",
            nonce=ch.nonce,
            submitted_actions=ch.actions,
            quality_ok=False,
            now=now,
        )
        assert state2 == ActivePresenceResultState.QUALITY_FAIL
        assert res2["status"] == "QUALITY_FAIL"

    def test_single_use_nonce_replay_rejected(self):
        """Replaying a previously consumed nonce or completed challenge is rejected."""
        now = datetime.now(timezone.utc)
        ch = challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-001",
            participant_id="usr-stu-001",
            now=now,
        )

        # First valid pass
        state1, _ = challenge_manager.respond_to_challenge(
            challenge_id=ch.challenge_id,
            participant_id="usr-stu-001",
            session_id="ses-001",
            nonce=ch.nonce,
            submitted_actions=ch.actions,
            now=now,
        )
        assert state1 == ActivePresenceResultState.PASSED

        # Replay attempt
        state2, res2 = challenge_manager.respond_to_challenge(
            challenge_id=ch.challenge_id,
            participant_id="usr-stu-001",
            session_id="ses-001",
            nonce=ch.nonce,
            submitted_actions=ch.actions,
            now=now,
        )
        assert state2 == ActivePresenceResultState.QUALITY_FAIL
        assert "Invalid or replayed" in res2.get("error", "")

    def test_completed_challenge_60s_cooldown(self):
        """A completed challenge enforces a 60-second cooldown before a new one can be created."""
        now = datetime.now(timezone.utc)
        ch = challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-001",
            participant_id="usr-stu-001",
            now=now,
        )
        challenge_manager.respond_to_challenge(
            challenge_id=ch.challenge_id,
            participant_id="usr-stu-001",
            session_id="ses-001",
            nonce=ch.nonce,
            submitted_actions=ch.actions,
            now=now,
        )

        # Attempt to issue another challenge 30s later (should fail cooldown)
        with pytest.raises(PermissionError, match="Completed challenge cooldown active"):
            challenge_manager.create_challenge(
                tenant_id="ten-001",
                session_id="ses-001",
                participant_id="usr-stu-001",
                now=now + timedelta(seconds=30),
            )

        # After 61s, creation succeeds
        ch2 = challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-001",
            participant_id="usr-stu-001",
            now=now + timedelta(seconds=61),
        )
        assert ch2 is not None

    def test_teacher_cooldown_5_minutes(self):
        """Teacher-requested challenge enforces a 5-minute cooldown per participant."""
        now = datetime.now(timezone.utc)
        challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-001",
            participant_id="usr-stu-001",
            is_teacher_initiated=True,
            now=now,
        )

        # Attempt teacher challenge 2 minutes later
        with pytest.raises(PermissionError, match="Teacher challenge cooldown active"):
            challenge_manager.create_challenge(
                tenant_id="ten-001",
                session_id="ses-001",
                participant_id="usr-stu-001",
                is_teacher_initiated=True,
                now=now + timedelta(minutes=2),
            )

    def test_automated_quota_max_3_per_hour(self):
        """Automated challenge generation enforces maximum 3 checks per 60 minutes."""
        now = datetime.now(timezone.utc)
        # Issue 3 challenges spaced 70s apart (clearing 60s completed cooldown)
        for i in range(3):
            ch = challenge_manager.create_challenge(
                tenant_id="ten-001",
                session_id="ses-001",
                participant_id="usr-stu-001",
                is_teacher_initiated=False,
                now=now + timedelta(seconds=i * 70),
            )
            challenge_manager.respond_to_challenge(
                challenge_id=ch.challenge_id,
                participant_id="usr-stu-001",
                session_id="ses-001",
                nonce=ch.nonce,
                submitted_actions=ch.actions,
                now=now + timedelta(seconds=i * 70),
            )

        # 4th automated check within the hour must be denied
        with pytest.raises(PermissionError, match="Maximum automated checks reached"):
            challenge_manager.create_challenge(
                tenant_id="ten-001",
                session_id="ses-001",
                participant_id="usr-stu-001",
                is_teacher_initiated=False,
                now=now + timedelta(minutes=20),
            )

    def test_accessibility_decline_and_manual_review_fallbacks(self):
        """Declining or requesting manual review transitions cleanly to non-punitive states."""
        now = datetime.now(timezone.utc)
        ch1 = challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-001",
            participant_id="usr-stu-001",
            now=now,
        )
        state_dec, res_dec = challenge_manager.decline_challenge(
            challenge_id=ch1.challenge_id,
            participant_id="usr-stu-001",
            session_id="ses-001",
            reason="Motor accommodation",
            now=now,
        )
        assert state_dec == ActivePresenceResultState.DECLINED
        assert res_dec["status"] == "DECLINED"

        # Alternative neutral verification path passes cleanly
        ch2 = challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-001",
            participant_id="usr-stu-002",
            now=now,
        )
        state_alt, res_alt = challenge_manager.respond_to_challenge(
            challenge_id=ch2.challenge_id,
            participant_id="usr-stu-002",
            session_id="ses-001",
            nonce=ch2.nonce,
            alternative_verification=True,
            now=now,
        )
        assert state_alt == ActivePresenceResultState.PASSED
        assert res_alt["alternative_verification_used"] is True


@pytest.mark.security
class TestActivePresenceSecurityAndIsolation:
    """Security tests verifying cross-session and cross-participant isolation."""

    def test_cross_session_challenge_rejection(self):
        """Responding to a challenge with a mismatched session_id is rejected."""
        ch = challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-target",
            participant_id="usr-stu-001",
        )
        state, res = challenge_manager.respond_to_challenge(
            challenge_id=ch.challenge_id,
            participant_id="usr-stu-001",
            session_id="ses-attacker",
            nonce=ch.nonce,
            submitted_actions=ch.actions,
        )
        assert state == ActivePresenceResultState.QUALITY_FAIL
        assert "Cross-session" in res.get("error", "")

    def test_cross_participant_challenge_rejection(self):
        """Responding to another student's challenge is rejected."""
        ch = challenge_manager.create_challenge(
            tenant_id="ten-001",
            session_id="ses-target",
            participant_id="usr-victim",
        )
        state, res = challenge_manager.respond_to_challenge(
            challenge_id=ch.challenge_id,
            participant_id="usr-attacker",
            session_id="ses-target",
            nonce=ch.nonce,
            submitted_actions=ch.actions,
        )
        assert state == ActivePresenceResultState.QUALITY_FAIL
        assert "Cross-participant" in res.get("error", "")

    def test_no_analytics_policy_blocks_challenge_creation(self):
        """Active Presence challenges cannot be created in NO_ANALYTICS sessions."""
        with pytest.raises(ValueError, match="disabled under NO_ANALYTICS"):
            challenge_manager.create_challenge(
                tenant_id="ten-001",
                session_id="ses-001",
                participant_id="usr-stu-001",
                policy_id=PolicyId.NO_ANALYTICS,
            )


@pytest.mark.contract
class TestActivePresenceAttentionIsolation:
    """Invariant test: Active Presence events NEVER modify attention scores, streaks, or patterns."""

    def test_presence_events_never_alter_attention_state(self):
        """Projection engine state reducer verifies attention is invariant to presence results."""
        initial_state = {
            "observation_state": "OBSERVABLE",
            "coverage_ratio": 1.0,
            "warning_streak": 2,
            "clean_streak": 0,
            "attention_pattern": "VARIABLE",
            "active_presence_state": "NOT_REQUESTED",
        }

        # Apply ACTIVE_PRESENCE_REQUESTED
        evt1 = {
            "event_type": "ACTIVE_PRESENCE_REQUESTED",
            "payload": {"challenge_id": "ch-1", "status": "REQUESTED"},
        }
        s1 = ProjectionEngine.reduce_participant_event(initial_state, evt1)
        assert s1["active_presence_state"] == "REQUESTED"
        assert s1["warning_streak"] == 2
        assert s1["clean_streak"] == 0
        assert s1["attention_pattern"] == "VARIABLE"

        # Apply ACTIVE_PRESENCE_TIMED_OUT
        evt2 = {
            "event_type": "ACTIVE_PRESENCE_TIMED_OUT",
            "payload": {"challenge_id": "ch-1", "result_state": "TIMED_OUT"},
        }
        s2 = ProjectionEngine.reduce_participant_event(s1, evt2)
        assert s2["active_presence_state"] == "TIMED_OUT"
        assert s2["warning_streak"] == 2
        assert s2["clean_streak"] == 0
        assert s2["attention_pattern"] == "VARIABLE"

        # Apply ACTIVE_PRESENCE_DECLINED
        evt3 = {
            "event_type": "ACTIVE_PRESENCE_DECLINED",
            "payload": {"challenge_id": "ch-1", "result_state": "DECLINED"},
        }
        s3 = ProjectionEngine.reduce_participant_event(s2, evt3)
        assert s3["active_presence_state"] == "DECLINED"
        assert s3["warning_streak"] == 2
        assert s3["clean_streak"] == 0
        assert s3["attention_pattern"] == "VARIABLE"


@pytest.mark.contract
class TestActivePresenceRESTEndpoints:
    """End-to-end REST API tests for Active Presence challenge lifecycle."""

    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_teacher_requests_presence_challenge(self, client, mock_supabase):
        """Teacher can issue an active presence challenge for a student in their session."""
        session_id = "ses-pres-001"
        tenant_id = "ten-0001"
        teacher_id = "usr-teacher-01"
        student_id = "usr-student-01"

        session = make_synthetic_session(
            session_id=session_id,
            tenant_id=tenant_id,
            teacher_id=teacher_id,
            policy_id="SUPERVISED_ASSESSMENT",
        )
        mock_supabase.table("sessions").insert([session]).execute()

        teacher_jwt = generate_test_jwt(user_id=teacher_id, tenant_id=tenant_id, role="teacher")
        headers = {"Authorization": f"Bearer {teacher_jwt}"}

        resp = client.post(
            f"/api/v1/sessions/{session_id}/presence/challenge/request",
            json={"participant_id": student_id, "trigger": "teacher_request"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "challenge" in data
        ch = data["challenge"]
        assert ch["participant_id"] == student_id
        assert len(ch["actions"]) == 2
        assert ch["nonce"] is not None

    def test_student_responds_presence_challenge_pass(self, client, mock_supabase):
        """Student responds with correct sequence proof to pass the challenge."""
        session_id = "ses-pres-002"
        tenant_id = "ten-0001"
        teacher_id = "usr-teacher-02"
        student_id = "usr-student-02"

        session = make_synthetic_session(
            session_id=session_id,
            tenant_id=tenant_id,
            teacher_id=teacher_id,
            policy_id="SUPERVISED_ASSESSMENT",
        )
        mock_supabase.table("sessions").insert([session]).execute()

        # Create challenge directly
        ch = challenge_manager.create_challenge(
            tenant_id=tenant_id,
            session_id=session_id,
            participant_id=student_id,
        )

        student_jwt = generate_test_jwt(user_id=student_id, tenant_id=tenant_id, role="student")
        headers = {"Authorization": f"Bearer {student_jwt}"}

        resp = client.post(
            f"/api/v1/sessions/{session_id}/presence/challenge/respond",
            json={
                "challenge_id": ch.challenge_id,
                "nonce": ch.nonce,
                "submitted_actions": ch.actions,
                "quality_ok": True,
                "is_neutral_baseline_held": True,
                "is_return_to_neutral_held": True,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["result_state"] == "PASSED"

    def test_student_declines_presence_challenge(self, client, mock_supabase):
        """Student can decline an active presence challenge via REST."""
        session_id = "ses-pres-003"
        tenant_id = "ten-0001"
        student_id = "usr-student-03"

        session = make_synthetic_session(
            session_id=session_id,
            tenant_id=tenant_id,
            policy_id="CLASSROOM",
        )
        mock_supabase.table("sessions").insert([session]).execute()

        ch = challenge_manager.create_challenge(
            tenant_id=tenant_id,
            session_id=session_id,
            participant_id=student_id,
        )

        student_jwt = generate_test_jwt(user_id=student_id, tenant_id=tenant_id, role="student")
        headers = {"Authorization": f"Bearer {student_jwt}"}

        resp = client.post(
            f"/api/v1/sessions/{session_id}/presence/challenge/decline",
            json={"challenge_id": ch.challenge_id, "reason": "Motor preference"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["result_state"] == "DECLINED"
