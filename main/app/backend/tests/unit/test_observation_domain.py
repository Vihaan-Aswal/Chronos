"""
Chronos Observation Domain & State Machine Unit Tests
Tests pure observation clock, classifier, evaluator, state machine invariants,
policy routing, and case management.
"""
from datetime import datetime, timezone, timedelta
import pytest

from observation.config import ObservationClockConfig, get_config
from observation.classifier import UsableSegmentClassifier, SegmentClassificationResult
from observation.window_evaluator import WindowEvaluator
from observation.state_machine import ObservationStateMachine
from observation.policy_router import PolicyRouter, PolicyId
from observation.case_manager import CaseManager


@pytest.mark.unit
class TestObservationClockConfig:
    def test_real_config_defaults(self):
        cfg = get_config(is_demo=False)
        assert cfg.window_duration_sec == 60.0
        assert cfg.sample_interval_sec == 5.0
        assert cfg.expected_segments == 12
        assert cfg.min_usable_segments == 9
        assert cfg.min_coverage_ratio == 0.75
        assert cfg.late_event_grace_sec == 2.0
        assert cfg.finalization_target_sec == 5.0
        assert cfg.warning_cue_exposure_sec == 20.0
        assert cfg.min_cue_interval_sec == 2.0
        assert cfg.stale_evidence_timeout_sec == 300.0
        assert cfg.is_demo is False

    def test_demo_config_defaults(self):
        cfg = get_config(is_demo=True)
        assert cfg.window_duration_sec == 10.0
        assert cfg.sample_interval_sec == 1.0
        assert cfg.expected_segments == 10
        assert cfg.min_usable_segments == 8
        assert cfg.min_coverage_ratio == 0.80
        assert cfg.late_event_grace_sec == 0.5
        assert cfg.finalization_target_sec == 1.0
        assert cfg.warning_cue_exposure_sec == 4.0
        assert cfg.min_cue_interval_sec == 1.0
        assert cfg.stale_evidence_timeout_sec == 60.0
        assert cfg.is_demo is True


@pytest.mark.unit
class TestUsableSegmentClassifier:
    def test_camera_inactive_disqualifies_segment(self):
        # Invariant 4: Technical intervals never become attention cues
        res = UsableSegmentClassifier.classify({"camera_active": False, "yaw_deg": 45.0})
        assert res.usable is False
        assert res.cue_away is False
        assert "CAMERA_UNAVAILABLE" in res.technical_reasons

    def test_camera_permission_denied(self):
        res = UsableSegmentClassifier.classify({
            "camera_active": False,
            "technical_reasons": ["CAMERA_PERMISSION_DENIED"]
        })
        assert res.usable is False
        assert "CAMERA_PERMISSION_DENIED" in res.technical_reasons

    def test_face_count_disqualifications(self):
        # No face
        res0 = UsableSegmentClassifier.classify({"face_count": 0, "yaw_deg": 30.0})
        assert res0.usable is False
        assert res0.cue_away is False
        assert "NO_FACE_DETECTED" in res0.technical_reasons

        # Multiple faces
        res2 = UsableSegmentClassifier.classify({"face_count": 2})
        assert res2.usable is False
        assert "MULTIPLE_FACES_DETECTED" in res2.technical_reasons

    def test_quality_score_disqualifications(self):
        res = UsableSegmentClassifier.classify({"quality_score": 0.65})
        assert res.usable is False
        assert "IMAGE_QUALITY_INSUFFICIENT" in res.technical_reasons

    def test_low_pose_confidence_disqualifies(self):
        res = UsableSegmentClassifier.classify({"pose_confidence": 0.55})
        assert res.usable is False
        assert "LOW_CONFIDENCE" in res.technical_reasons

    def test_page_hidden_never_enters_attention_exposure(self):
        # Invariant 5: PAGE_HIDDEN intervals never enter attention exposure
        res = UsableSegmentClassifier.classify({
            "browser_context": "PAGE_HIDDEN",
            "yaw_deg": 40.0,
            "quality_score": 0.95,
        })
        assert res.usable is True
        assert res.cue_away is False
        assert res.attention_reasons == []

    def test_usable_head_pose_cues(self):
        # Yaw threshold >= 25 deg
        res_yaw = UsableSegmentClassifier.classify({"yaw_deg": 26.0})
        assert res_yaw.usable is True
        assert res_yaw.cue_away is True
        assert "ORIENTATION_AWAY" in res_yaw.attention_reasons

        # Pitch threshold >= 20 deg
        res_pitch = UsableSegmentClassifier.classify({"pitch_deg": -22.0})
        assert res_pitch.usable is True
        assert res_pitch.cue_away is True

        # Forward facing
        res_fwd = UsableSegmentClassifier.classify({"yaw_deg": 5.0, "pitch_deg": 3.0})
        assert res_fwd.usable is True
        assert res_fwd.cue_away is False


@pytest.mark.unit
class TestWindowEvaluator:
    def test_insufficient_usable_segments_results_in_no_data(self):
        # Invariant 1 & 2: NO_DATA never becomes warning or clean
        cfg = get_config(is_demo=False)
        segments = [{"usable": False, "camera_active": False} for _ in range(12)]
        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["observation_state"] == "NO_DATA"
        assert res["classification"] == "NOT_EVALUATED"
        assert res["coverage_ratio"] == 0.0
        assert "CAMERA_UNAVAILABLE" in res["technical_reasons"]

    def test_qualified_cue_exposure_generates_valid_warning(self):
        # Demo mode: 10 segments of 1.0s, warning requires >= 4.0s cue exposure
        cfg = get_config(is_demo=True)
        # 5 consecutive cue_away segments (5s >= 4s)
        segments = [{"yaw_deg": 30.0, "quality_score": 0.95} for _ in range(5)]
        # 5 forward-facing segments
        segments += [{"yaw_deg": 0.0, "quality_score": 0.95} for _ in range(5)]

        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["observation_state"] == "VALID"
        assert res["classification"] == "VALID_WARNING"
        assert res["cue_exposure_seconds"] == 5.0
        assert "ORIENTATION_AWAY" in res["reason_codes"]

    def test_cue_exposure_below_threshold_generates_valid_clean(self):
        cfg = get_config(is_demo=True)
        # 2 cue_away segments (2s < 4s threshold)
        segments = [{"yaw_deg": 30.0} for _ in range(2)]
        # 8 forward-facing segments
        segments += [{"yaw_deg": 0.0} for _ in range(8)]

        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["observation_state"] == "VALID"
        assert res["classification"] == "VALID_CLEAN"
        assert res["reason_codes"] == []

    def test_duplicate_sample_id_discarded(self):
        evaluator = WindowEvaluator(is_demo=True)
        accepted1 = evaluator.add_sample({"sample_id": "samp-1", "yaw_deg": 0.0})
        accepted2 = evaluator.add_sample({"sample_id": "samp-1", "yaw_deg": 0.0})
        assert accepted1 is True
        assert accepted2 is False
        assert len(evaluator.segments) == 1

    def test_late_sample_outside_grace_rejected(self):
        now = datetime.now(timezone.utc)
        win_start = now
        win_end = now + timedelta(seconds=10)
        evaluator = WindowEvaluator(
            is_demo=True,
            window_start=win_start,
            window_end=win_end,
        )
        # Sample within grace (0.5s)
        ok_sample = evaluator.add_sample({"yaw_deg": 0.0}, timestamp=win_end + timedelta(seconds=0.2))
        assert ok_sample is True

        # Late sample outside grace (2.0s > 0.5s)
        late_sample = evaluator.add_sample({"yaw_deg": 0.0}, timestamp=win_end + timedelta(seconds=2.0))
        assert late_sample is False


@pytest.mark.unit
class TestObservationStateMachineInvariants:
    def test_invariant_1_and_2_no_data_never_increments_or_recovers(self):
        sm = ObservationStateMachine(is_demo=False)
        # Warning window
        sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"})
        assert sm.warning_streak == 1

        # 3 NO_DATA windows
        for _ in range(3):
            res = sm.evaluate_window({"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"})
            assert res["observation_state"] == "NO_DATA"
            assert res["warning_streak"] == 1
            assert res["clean_streak"] == 0
            assert res["recovered"] is False

    def test_invariant_8_three_warning_windows_for_persistent_concern(self):
        sm = ObservationStateMachine(is_demo=False)
        w = {"observation_state": "VALID", "classification": "VALID_WARNING"}

        r1 = sm.evaluate_window(w)
        assert r1["warning_streak"] == 1
        assert r1["case_state"] == "SELF_RECOVERY"

        r2 = sm.evaluate_window(w)
        assert r2["warning_streak"] == 2
        assert r2["case_state"] == "MONITOR"

        r3 = sm.evaluate_window(w)
        assert r3["warning_streak"] == 3
        assert r3["attention_pattern"] == "SUSTAINED_CONCERN"
        assert r3["case_state"] == "ACTION_REQUIRED"

    def test_invariant_9_two_clean_windows_for_recovery(self):
        sm = ObservationStateMachine(is_demo=False)
        w_warn = {"observation_state": "VALID", "classification": "VALID_WARNING"}
        w_clean = {"observation_state": "VALID", "classification": "VALID_CLEAN"}

        # Reach sustained concern
        for _ in range(3):
            sm.evaluate_window(w_warn)
        assert sm.case_state == "ACTION_REQUIRED"

        # Clean 1: partial recovery
        r1 = sm.evaluate_window(w_clean)
        assert r1["recovered"] is False
        assert r1["clean_streak"] == 1
        assert r1["attention_pattern"] == "VARIABLE"

        # Clean 2: stable recovery
        r2 = sm.evaluate_window(w_clean)
        assert r2["recovered"] is True
        assert r2["clean_streak"] == 2
        assert r2["warning_streak"] == 0
        assert r2["attention_pattern"] == "STABLE"
        assert r2["case_state"] == "RESOLVED"

    def test_invariant_10_stale_evidence_timeout(self):
        # 300 seconds of continuous NO_DATA resets warning streak
        sm = ObservationStateMachine(is_demo=False)
        start_time = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)

        # Create warning streak = 2
        sm.evaluate_window(
            {"observation_state": "VALID", "classification": "VALID_WARNING"},
            timestamp=start_time
        )
        sm.evaluate_window(
            {"observation_state": "VALID", "classification": "VALID_WARNING"},
            timestamp=start_time + timedelta(seconds=60)
        )
        assert sm.warning_streak == 2

        # Enter NO_DATA at 10:02:00
        no_data_start = start_time + timedelta(seconds=120)
        sm.evaluate_window(
            {"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"},
            timestamp=no_data_start
        )
        assert sm.warning_streak == 2

        # 200s later (at 10:05:20) -> still <= 300s
        sm.evaluate_window(
            {"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"},
            timestamp=no_data_start + timedelta(seconds=200)
        )
        assert sm.warning_streak == 2

        # 305s later (at 10:07:05) -> exceeds 300s stale timeout
        res = sm.evaluate_window(
            {"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"},
            timestamp=no_data_start + timedelta(seconds=305)
        )
        assert res["warning_streak"] == 0
        assert sm.warning_streak == 0


@pytest.mark.unit
class TestPolicyRouter:
    def test_classroom_downgrades_to_student_only(self):
        state = {
            "case_state": "ACTION_REQUIRED",
            "warning_streak": 3,
            "attention_pattern": "SUSTAINED_CONCERN",
        }
        routed = PolicyRouter.route_window_state(state, PolicyId.CLASSROOM)
        assert routed["case_state"] == "MONITOR"
        assert routed["priority"] == "STUDENT_ONLY"
        assert routed["teacher_action_required"] is False

    def test_resource_supported_assessment_routes_action_required(self):
        state = {
            "case_state": "ACTION_REQUIRED",
            "warning_streak": 3,
            "attention_pattern": "SUSTAINED_CONCERN",
        }
        routed = PolicyRouter.route_window_state(state, PolicyId.RESOURCE_SUPPORTED_ASSESSMENT)
        assert routed["case_state"] == "ACTION_REQUIRED"
        assert routed["priority"] == "ACTION_REQUIRED"
        assert routed["teacher_action_required"] is True

    def test_no_analytics_suppresses_telemetry(self):
        state = {
            "case_state": "ACTION_REQUIRED",
            "warning_streak": 3,
            "attention_pattern": "SUSTAINED_CONCERN",
        }
        routed = PolicyRouter.route_window_state(state, PolicyId.NO_ANALYTICS)
        assert routed["attention_pattern"] == "UNKNOWN"
        assert routed["case_state"] == "NONE"
        assert routed["analytics_enabled"] is False

        case_routed = PolicyRouter.route_attention_case({"case_id": "c1"}, PolicyId.NO_ANALYTICS)
        assert case_routed is None


@pytest.mark.unit
class TestCaseManagerAndIncidents:
    def test_groups_repeated_events_into_single_case(self):
        events = [
            {
                "event_id": f"evt-{i}",
                "event_type": "CAMERA_STATE_CHANGED",
                "participant_id": "usr-1",
                "occurred_at": f"2026-08-20T10:0{i}:00Z",
                "payload": {"is_usable": False, "reason": "CAMERA_UNAVAILABLE"},
            }
            for i in range(5)
        ]
        cases = CaseManager.build_session_cases(events, "ses-01")
        # Filter technical camera cases
        cam_cases = [c for c in cases if c["category"] == "TECHNICAL_CAMERA"]
        assert len(cam_cases) == 1
        assert len(cam_cases[0]["event_ids"]) == 5

    def test_correlated_session_incident_detection(self):
        # 3 distinct participants experience technical camera failure within 30s
        events = [
            {
                "event_id": f"evt-{i}",
                "event_type": "CAMERA_STATE_CHANGED",
                "participant_id": f"usr-{i}",
                "occurred_at": f"2026-08-20T10:00:{10 * i:02d}Z",
                "payload": {"is_usable": False, "reason": "CAMERA_UNAVAILABLE"},
            }
            for i in range(1, 4)
        ]
        cases = CaseManager.build_session_cases(events, "ses-01")
        incident_cases = [c for c in cases if c["category"] == "SESSION_INCIDENT"]
        assert len(incident_cases) == 1
        assert incident_cases[0]["priority"] == "URGENT"
        assert incident_cases[0]["affected_participant_count"] == 3
