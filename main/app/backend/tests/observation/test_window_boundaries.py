"""
Chronos Window Boundary Exact Threshold Tests
Domain Subsystem: Observation & State Machine

Verifies exact mathematical boundary conditions:
- Real clock: exactly 8 usable segments out of 12 (66.7% coverage) -> NO_DATA / NOT_EVALUATED
- Real clock: exactly 9 usable segments out of 12 (75.0% coverage) -> VALID window evaluated (CLEAN or WARNING)
- Demo clock: exactly 7 usable segments out of 10 (70.0% coverage) -> NO_DATA / NOT_EVALUATED
- Demo clock: exactly 8 usable segments out of 10 (80.0% coverage) -> VALID demo window evaluated
"""
import pytest
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

from observation.config import ObservationClockConfig, get_config
from observation.classifier import UsableSegmentClassifier
from observation.window_evaluator import WindowEvaluator


@pytest.mark.unit
class TestRealClockBoundaryThresholds:
    """Exact boundary tests for Real clock (12 expected segments, threshold = 9 usable / 75%)."""

    def test_real_clock_exactly_8_usable_segments_results_in_no_data(self):
        """Boundary: 8 / 12 usable segments (66.7%) is below 75% threshold -> NO_DATA."""
        cfg = get_config(is_demo=False)
        segments: List[Dict[str, Any]] = []

        # 8 usable segments (with cue away)
        for _ in range(8):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": True,
            })

        # 4 unusable segments (camera off)
        for _ in range(4):
            segments.append({
                "camera_active": False,
                "technical_reasons": ["CAMERA_UNAVAILABLE"],
            })

        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["expected_segments"] == 12
        assert res["usable_segments"] == 8
        assert res["coverage_ratio"] == 0.67
        assert res["observation_state"] == "NO_DATA"
        assert res["classification"] == "NOT_EVALUATED"
        assert res["cue_exposure_seconds"] == 0.0
        assert "CAMERA_UNAVAILABLE" in res["technical_reasons"]

    def test_real_clock_exactly_9_usable_segments_results_in_valid_window(self):
        """Boundary: 9 / 12 usable segments (75.0%) meets 75% threshold -> VALID."""
        cfg = get_config(is_demo=False)
        segments: List[Dict[str, Any]] = []

        # 9 usable clean segments
        for _ in range(9):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": False,
            })

        # 3 unusable segments
        for _ in range(3):
            segments.append({
                "camera_active": False,
                "technical_reasons": ["CAMERA_UNAVAILABLE"],
            })

        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["expected_segments"] == 12
        assert res["usable_segments"] == 9
        assert res["coverage_ratio"] == 0.75
        assert res["observation_state"] == "VALID"
        assert res["classification"] == "VALID_CLEAN"
        assert res["cue_exposure_seconds"] == 0.0

    def test_real_clock_9_usable_with_sufficient_cue_exposure_is_valid_warning(self):
        """Boundary: 9 usable segments with 4 cue segments (4 * 5s = 20s) -> VALID_WARNING."""
        cfg = get_config(is_demo=False)
        segments: List[Dict[str, Any]] = []

        # 4 consecutive cue-away segments (4 * 5s = 20s cue exposure)
        for _ in range(4):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": True,
            })

        # 5 clean segments
        for _ in range(5):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": False,
            })

        # 3 unusable segments
        for _ in range(3):
            segments.append({
                "camera_active": False,
            })

        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["usable_segments"] == 9
        assert res["observation_state"] == "VALID"
        assert res["cue_exposure_seconds"] == 20.0
        assert res["classification"] == "VALID_WARNING"
        assert res["reason_codes"] == ["ORIENTATION_AWAY"]


@pytest.mark.unit
class TestDemoClockBoundaryThresholds:
    """Exact boundary tests for Demo clock (10 expected segments, threshold = 8 usable / 80%)."""

    def test_demo_clock_exactly_7_usable_segments_results_in_no_data(self):
        """Boundary: 7 / 10 usable segments (70.0%) is below 80% threshold -> NO_DATA."""
        cfg = get_config(is_demo=True)
        segments: List[Dict[str, Any]] = []

        # 7 usable cue segments
        for _ in range(7):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": True,
            })

        # 3 unusable segments
        for _ in range(3):
            segments.append({
                "camera_active": False,
                "technical_reasons": ["NETWORK_DISCONNECTED"],
            })

        res = WindowEvaluator.evaluate_segments(segments, config=cfg, is_demo=True)
        assert res["expected_segments"] == 10
        assert res["usable_segments"] == 7
        assert res["coverage_ratio"] == 0.70
        assert res["observation_state"] == "NO_DATA"
        assert res["classification"] == "NOT_EVALUATED"
        assert res["cue_exposure_seconds"] == 0.0
        assert "NETWORK_DISCONNECTED" in res["technical_reasons"]

    def test_demo_clock_exactly_8_usable_segments_results_in_valid_window(self):
        """Boundary: 8 / 10 usable segments (80.0%) meets 80% threshold -> VALID."""
        cfg = get_config(is_demo=True)
        segments: List[Dict[str, Any]] = []

        # 8 usable clean segments
        for _ in range(8):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": False,
            })

        # 2 unusable segments
        for _ in range(2):
            segments.append({
                "camera_active": False,
            })

        res = WindowEvaluator.evaluate_segments(segments, config=cfg, is_demo=True)
        assert res["expected_segments"] == 10
        assert res["usable_segments"] == 8
        assert res["coverage_ratio"] == 0.80
        assert res["observation_state"] == "VALID"
        assert res["classification"] == "VALID_CLEAN"
        assert res["cue_exposure_seconds"] == 0.0

    def test_demo_clock_8_usable_with_4s_cue_exposure_is_valid_warning(self):
        """Boundary: Demo mode with exactly 4s cue exposure (4 samples * 1s) -> VALID_WARNING."""
        cfg = get_config(is_demo=True)
        segments: List[Dict[str, Any]] = []

        # 4 consecutive cue segments (4 * 1s = 4.0s)
        for _ in range(4):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": True,
            })

        # 4 clean segments
        for _ in range(4):
            segments.append({
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.90,
                "orientation_away": False,
            })

        # 2 unusable segments
        for _ in range(2):
            segments.append({
                "camera_active": False,
            })

        res = WindowEvaluator.evaluate_segments(segments, config=cfg, is_demo=True)
        assert res["usable_segments"] == 8
        assert res["observation_state"] == "VALID"
        assert res["cue_exposure_seconds"] == 4.0
        assert res["classification"] == "VALID_WARNING"
        assert res["reason_codes"] == ["ORIENTATION_AWAY"]
