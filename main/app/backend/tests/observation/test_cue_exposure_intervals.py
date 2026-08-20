"""
Chronos Cue Exposure & Interval Calculation Tests
Domain Subsystem: Observation & State Machine

Verifies:
- Exactly 20 seconds of cue exposure (single sustained vs multiple qualifying intervals).
- Multiple short intervals vs one sustained interval.
- Qualified interval thresholds (min_cue_interval_sec).
- Demo clock 4s cue exposure threshold.
- Clean vs Warning classification from interval aggregations.
"""
import pytest
from typing import Any, Dict, List

from observation.config import ObservationClockConfig, get_config
from observation.window_evaluator import WindowEvaluator


@pytest.mark.unit
class TestCueExposureIntervalCalculations:
    """Tests for qualified cue exposure interval rules."""

    def test_single_sustained_interval_exactly_20s_produces_warning(self):
        """Single sustained 20-second interval (4 consecutive 5s segments) -> VALID_WARNING."""
        cfg = get_config(is_demo=False)
        segments: List[Dict[str, Any]] = []

        # 4 consecutive cue-away segments (4 * 5s = 20s)
        for _ in range(4):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": True,
            })

        # 8 clean segments (total 12 segments)
        for _ in range(8):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": False,
            })

        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["usable_segments"] == 12
        assert res["cue_exposure_seconds"] == 20.0
        assert res["classification"] == "VALID_WARNING"
        assert res["reason_codes"] == ["ORIENTATION_AWAY"]

    def test_two_distinct_intervals_totaling_20s_produces_warning(self):
        """Two distinct 10s intervals (2 segs + clean + 2 segs) totaling 20s -> VALID_WARNING."""
        cfg = get_config(is_demo=False)
        segments: List[Dict[str, Any]] = []

        # Interval 1: 2 cue segments (10s)
        for _ in range(2):
            segments.append({"camera_active": True, "face_count": 1, "quality_score": 0.95, "orientation_away": True})

        # Clean gap: 4 clean segments (20s)
        for _ in range(4):
            segments.append({"camera_active": True, "face_count": 1, "quality_score": 0.95, "orientation_away": False})

        # Interval 2: 2 cue segments (10s)
        for _ in range(2):
            segments.append({"camera_active": True, "face_count": 1, "quality_score": 0.95, "orientation_away": True})

        # Remaining 4 clean segments
        for _ in range(4):
            segments.append({"camera_active": True, "face_count": 1, "quality_score": 0.95, "orientation_away": False})

        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["usable_segments"] == 12
        assert res["cue_exposure_seconds"] == 20.0
        assert res["classification"] == "VALID_WARNING"
        assert res["reason_codes"] == ["ORIENTATION_AWAY"]

    def test_three_intervals_totaling_15s_remains_clean(self):
        """Three 5s intervals (15s total cue exposure) is under 20s threshold -> VALID_CLEAN."""
        cfg = get_config(is_demo=False)
        segments: List[Dict[str, Any]] = []

        # 3 isolated 5s cue segments separated by clean segments
        for i in range(12):
            is_cue = i in (1, 5, 9)  # 3 segments * 5s = 15s
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": is_cue,
            })

        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["usable_segments"] == 12
        assert res["cue_exposure_seconds"] == 15.0
        assert res["classification"] == "VALID_CLEAN"
        assert res["reason_codes"] == []

    def test_demo_mode_exactly_4s_cue_exposure_produces_warning(self):
        """Demo mode: 4 seconds of cue exposure (4 * 1s samples) -> VALID_WARNING."""
        cfg = get_config(is_demo=True)
        segments: List[Dict[str, Any]] = []

        # Two 2-second intervals: 2 segs + clean + 2 segs = 4s
        for _ in range(2):
            segments.append({"camera_active": True, "face_count": 1, "quality_score": 0.95, "orientation_away": True})
        for _ in range(3):
            segments.append({"camera_active": True, "face_count": 1, "quality_score": 0.95, "orientation_away": False})
        for _ in range(2):
            segments.append({"camera_active": True, "face_count": 1, "quality_score": 0.95, "orientation_away": True})
        for _ in range(3):
            segments.append({"camera_active": True, "face_count": 1, "quality_score": 0.95, "orientation_away": False})

        res = WindowEvaluator.evaluate_segments(segments, config=cfg, is_demo=True)
        assert res["usable_segments"] == 10
        assert res["cue_exposure_seconds"] == 4.0
        assert res["classification"] == "VALID_WARNING"

    def test_demo_mode_3s_cue_exposure_remains_clean(self):
        """Demo mode: 3 seconds of cue exposure (< 4.0s) -> VALID_CLEAN."""
        cfg = get_config(is_demo=True)
        segments: List[Dict[str, Any]] = []

        for i in range(10):
            is_cue = i < 3  # 3 segments * 1s = 3s
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": is_cue,
            })

        res = WindowEvaluator.evaluate_segments(segments, config=cfg, is_demo=True)
        assert res["usable_segments"] == 10
        assert res["cue_exposure_seconds"] == 3.0
        assert res["classification"] == "VALID_CLEAN"
