"""
Chronos Stale Evidence, Timing & Sample Robustness Tests
Domain Subsystem: Observation & State Machine

Verifies:
- Camera loss mid-window -> NO_DATA when usable segments drop below threshold.
- Reconnect after NO_DATA -> immediate resumption of valid evaluation without phantom recovery.
- Five-minute (300s) stale streak expiry -> long NO_DATA gap clears warning streak.
- Sub-5-minute NO_DATA (e.g. 240s) -> streak is preserved.
- Late samples within grace -> accepted; outside grace -> rejected.
- Duplicate sample IDs -> discarded without inflating coverage or cue exposure.
"""
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List
import pytest

from observation.config import ObservationClockConfig, get_config
from observation.window_evaluator import WindowEvaluator
from observation.state_machine import ObservationStateMachine


@pytest.mark.unit
class TestCameraLossMidWindow:
    def test_camera_loss_mid_window_reduces_usable_segments(self):
        """First 6 segments usable (30s), followed by 6 camera loss segments -> NO_DATA."""
        cfg = get_config(is_demo=False)
        segments: List[Dict[str, Any]] = []

        # 6 usable segments
        for _ in range(6):
            segments.append({"camera_active": True, "face_count": 1, "quality_score": 0.95, "orientation_away": True})

        # 6 camera loss segments
        for _ in range(6):
            segments.append({"camera_active": False, "technical_reasons": ["CAMERA_UNAVAILABLE"]})

        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["usable_segments"] == 6
        assert res["coverage_ratio"] == 0.50
        assert res["observation_state"] == "NO_DATA"
        assert res["classification"] == "NOT_EVALUATED"
        assert "CAMERA_UNAVAILABLE" in res["technical_reasons"]


@pytest.mark.unit
class TestReconnectAfterNoData:
    def test_reconnect_after_no_data_resumes_clean_streak(self):
        """After 3 NO_DATA windows, a valid clean window starts clean_streak=1."""
        sm = ObservationStateMachine(is_demo=False)

        # 3 NO_DATA windows
        for _ in range(3):
            res = sm.evaluate_window({"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"})
            assert res["warning_streak"] == 0
            assert res["clean_streak"] == 0
            assert res["recovered"] is False

        # First valid clean window after reconnect
        res_clean = sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_CLEAN"})
        assert res_clean["clean_streak"] == 1
        assert res_clean["warning_streak"] == 0
        assert res_clean["recovered"] is False
        assert sm.clean_streak == 1


@pytest.mark.unit
class TestFiveMinuteStaleEvidenceExpiry:
    def test_five_minute_no_data_expires_warning_streak(self):
        """Warning streak = 2. 5 minutes (300s) of NO_DATA expires the streak back to 0."""
        sm = ObservationStateMachine(is_demo=False)
        base_time = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)

        # 2 warning windows (at t=0 and t=60s)
        sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"}, timestamp=base_time)
        sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"}, timestamp=base_time + timedelta(seconds=60))
        assert sm.warning_streak == 2
        assert sm.case_state == "MONITOR"

        # NO_DATA begins at t=120s
        t_nodata_start = base_time + timedelta(seconds=120)
        sm.evaluate_window({"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"}, timestamp=t_nodata_start)
        assert sm.warning_streak == 2

        # Advance time by 300s (t=420s -> elapsed = 300s)
        t_expired = t_nodata_start + timedelta(seconds=300)
        res_expired = sm.evaluate_window({"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"}, timestamp=t_expired)
        assert sm.warning_streak == 0  # Streak expired

        # Next valid warning window starts a fresh streak of 1 (not 3)
        t_new_window = t_expired + timedelta(seconds=60)
        res_fresh = sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"}, timestamp=t_new_window)
        assert res_fresh["warning_streak"] == 1
        assert res_fresh["case_state"] == "SELF_RECOVERY"

    def test_under_five_minute_no_data_preserves_warning_streak(self):
        """Warning streak = 2. 4 minutes (240s) of NO_DATA preserves the streak."""
        sm = ObservationStateMachine(is_demo=False)
        base_time = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)

        # 2 warning windows
        sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"}, timestamp=base_time)
        sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"}, timestamp=base_time + timedelta(seconds=60))
        assert sm.warning_streak == 2

        # NO_DATA starts at t=120s
        t_nodata_start = base_time + timedelta(seconds=120)
        sm.evaluate_window({"observation_state": "NO_DATA", "classification": "NOT_EVALUATED"}, timestamp=t_nodata_start)

        # Gap of 240s (< 300s) at t=360s
        t_resume = t_nodata_start + timedelta(seconds=240)
        res_resume = sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"}, timestamp=t_resume)
        assert res_resume["warning_streak"] == 3
        assert res_resume["case_state"] == "ACTION_REQUIRED"
        assert res_resume["attention_pattern"] == "SUSTAINED_CONCERN"


@pytest.mark.unit
class TestSampleDeduplicationAndLateGrace:
    def test_late_sample_within_grace_accepted(self):
        """Sample arriving 1.5s after window end (within 2.0s grace) is accepted."""
        cfg = get_config(is_demo=False)
        t_start = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)
        t_end = datetime(2026, 8, 20, 10, 1, 0, tzinfo=timezone.utc)
        evaluator = WindowEvaluator(config=cfg, window_start=t_start, window_end=t_end)

        # Sample arriving at 10:01:01.5 (1.5s after end)
        sample_time = t_end + timedelta(seconds=1.5)
        accepted = evaluator.add_sample({
            "sample_id": "s-late-01",
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
        }, timestamp=sample_time)
        assert accepted is True
        assert len(evaluator.segments) == 1

    def test_late_sample_outside_grace_rejected(self):
        """Sample arriving 2.5s after window end (beyond 2.0s grace) is rejected."""
        cfg = get_config(is_demo=False)
        t_start = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)
        t_end = datetime(2026, 8, 20, 10, 1, 0, tzinfo=timezone.utc)
        evaluator = WindowEvaluator(config=cfg, window_start=t_start, window_end=t_end)

        # Sample arriving at 10:01:02.5 (2.5s after end)
        sample_time = t_end + timedelta(seconds=2.5)
        accepted = evaluator.add_sample({
            "sample_id": "s-toolate-01",
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
        }, timestamp=sample_time)
        assert accepted is False
        assert len(evaluator.segments) == 0

    def test_duplicate_sample_id_discarded(self):
        """Adding sample with duplicate sample_id returns False and is not added."""
        evaluator = WindowEvaluator()
        s1 = {"sample_id": "dup-123", "camera_active": True, "face_count": 1, "quality_score": 0.95}
        assert evaluator.add_sample(s1) is True
        assert evaluator.add_sample(s1) is False
        assert len(evaluator.segments) == 1
