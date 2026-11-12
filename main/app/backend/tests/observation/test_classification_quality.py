"""
tests/observation/test_classification_quality.py
Domain Subsystem: Observation & State Machine
Exhaustive tests for UsableSegmentClassifier, Quality & Usability classification,
technical impairment disqualifications, and observation invariants (Invariants 4, 5, 6).
"""
from datetime import datetime, timezone, timedelta
import pytest
from typing import Any, Dict, List

from observation.classifier import UsableSegmentClassifier, SegmentClassificationResult
from observation.config import ObservationClockConfig, get_config
from observation.window_evaluator import WindowEvaluator
from observation.state_machine import ObservationStateMachine
from contracts import (
    ObservationSamplePayload,
    TechnicalReasonCode,
    AttentionReasonCode,
    IdentityState,
    IdentityResultPayload,
)


@pytest.mark.unit
class TestCameraUsabilityClassification:
    """Tests for camera activity, availability, and permission states."""

    def test_camera_active_false_defaults_to_camera_unavailable(self):
        """When camera is inactive and no reason passed, defaults to CAMERA_UNAVAILABLE."""
        res = UsableSegmentClassifier.classify({"camera_active": False})
        assert res.usable is False
        assert res.cue_away is False
        assert "CAMERA_UNAVAILABLE" in res.technical_reasons
        assert res.attention_reasons == []

    def test_camera_permission_denied_preserves_specific_reason(self):
        """When CAMERA_PERMISSION_DENIED is passed with camera inactive, it is recorded."""
        res = UsableSegmentClassifier.classify({
            "camera_active": False,
            "technical_reasons": ["CAMERA_PERMISSION_DENIED"],
        })
        assert res.usable is False
        assert res.cue_away is False
        assert "CAMERA_PERMISSION_DENIED" in res.technical_reasons
        assert "CAMERA_UNAVAILABLE" not in res.technical_reasons

    @pytest.mark.parametrize("yaw,pitch,roll", [
        (45.0, 0.0, 0.0),
        (-60.0, 30.0, 10.0),
        (0.0, -45.0, 0.0),
        (90.0, 90.0, 0.0),
    ])
    def test_camera_inactive_with_extreme_head_pose_never_cues_away(self, yaw: float, pitch: float, roll: float):
        """Invariant 4: Inactive camera intervals never generate attention cues regardless of pose."""
        res = UsableSegmentClassifier.classify({
            "camera_active": False,
            "yaw_deg": yaw,
            "pitch_deg": pitch,
            "roll_deg": roll,
            "orientation_away": True,
            "cue_away": True,
        })
        assert res.usable is False
        assert res.cue_away is False
        assert res.attention_reasons == []
        assert "CAMERA_UNAVAILABLE" in res.technical_reasons

    def test_camera_active_true_with_valid_face_is_usable(self):
        """Camera active with 1 face and good quality/confidence is usable."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
            "pose_confidence": 0.90,
            "yaw_deg": 0.0,
            "pitch_deg": 0.0,
        })
        assert res.usable is True
        assert res.cue_away is False
        assert res.technical_reasons == []


@pytest.mark.unit
class TestFaceDetectionClassification:
    """Tests for face count validation (0, 1, multiple)."""

    def test_zero_faces_detected_disqualifies_segment(self):
        """face_count=0 produces NO_FACE_DETECTED and usable=False."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": 0,
            "quality_score": 0.95,
        })
        assert res.usable is False
        assert res.cue_away is False
        assert "NO_FACE_DETECTED" in res.technical_reasons
        assert res.face_count == 0

    @pytest.mark.parametrize("yaw,pitch", [
        (35.0, 0.0),
        (-40.0, 25.0),
        (0.0, -30.0),
    ])
    def test_zero_faces_with_pose_telemetry_never_cues_away(self, yaw: float, pitch: float):
        """Invariant 4: Zero faces detected never generates attention cues even with pose angles."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": 0,
            "yaw_deg": yaw,
            "pitch_deg": pitch,
            "orientation_away": True,
        })
        assert res.usable is False
        assert res.cue_away is False
        assert res.attention_reasons == []
        assert "NO_FACE_DETECTED" in res.technical_reasons

    def test_single_face_detected_is_usable(self):
        """face_count=1 with sufficient quality/confidence is usable."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.85,
            "pose_confidence": 0.80,
        })
        assert res.usable is True
        assert res.face_count == 1
        assert res.technical_reasons == []

    @pytest.mark.parametrize("count", [2, 3, 4, 10])
    def test_multiple_faces_detected_disqualifies_segment(self, count: int):
        """face_count > 1 produces MULTIPLE_FACES_DETECTED and usable=False."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": count,
            "quality_score": 0.95,
            "pose_confidence": 0.90,
        })
        assert res.usable is False
        assert res.cue_away is False
        assert "MULTIPLE_FACES_DETECTED" in res.technical_reasons
        assert res.face_count == count

    @pytest.mark.parametrize("count", [2, 3])
    def test_multiple_faces_with_orientation_away_never_cues_away(self, count: int):
        """Invariant 4: Multiple faces never generate attention cues even if orientation_away=True."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": count,
            "orientation_away": True,
            "yaw_deg": 40.0,
            "cue_away": True,
        })
        assert res.usable is False
        assert res.cue_away is False
        assert res.attention_reasons == []
        assert "MULTIPLE_FACES_DETECTED" in res.technical_reasons


@pytest.mark.unit
class TestQualityScoreClassification:
    """Tests for image quality threshold (0.70 threshold boundary)."""

    @pytest.mark.parametrize("score,expected_usable", [
        (1.0, True),
        (0.85, True),
        (0.70, True),
        (0.699, False),
        (0.69, False),
        (0.50, False),
        (0.10, False),
        (0.0, False),
    ])
    def test_quality_score_threshold_boundary(self, score: float, expected_usable: bool):
        """Quality score >= 0.70 is usable; < 0.70 is disqualified."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": 1,
            "quality_score": score,
            "pose_confidence": 0.90,
        })
        assert res.usable is expected_usable
        if not expected_usable:
            assert res.cue_away is False
            assert "IMAGE_QUALITY_INSUFFICIENT" in res.technical_reasons

    def test_insufficient_quality_reports_image_quality_insufficient(self):
        """Quality score < 0.70 records IMAGE_QUALITY_INSUFFICIENT."""
        res = UsableSegmentClassifier.classify({
            "quality_score": 0.65,
            "pose_confidence": 0.90,
        })
        assert res.usable is False
        assert "IMAGE_QUALITY_INSUFFICIENT" in res.technical_reasons

    def test_camera_poor_quality_preserved_when_passed(self):
        """If input technical reasons contains CAMERA_POOR_QUALITY, it is preserved."""
        res = UsableSegmentClassifier.classify({
            "quality_score": 0.50,
            "technical_reasons": ["CAMERA_POOR_QUALITY"],
        })
        assert res.usable is False
        assert "CAMERA_POOR_QUALITY" in res.technical_reasons

    @pytest.mark.parametrize("yaw,pitch", [
        (30.0, 0.0),
        (-45.0, -30.0),
    ])
    def test_poor_quality_with_head_turn_never_cues_away(self, yaw: float, pitch: float):
        """Invariant 4: Poor quality frames never contribute attention cues."""
        res = UsableSegmentClassifier.classify({
            "quality_score": 0.55,
            "yaw_deg": yaw,
            "pitch_deg": pitch,
            "orientation_away": True,
        })
        assert res.usable is False
        assert res.cue_away is False
        assert res.attention_reasons == []


@pytest.mark.unit
class TestPoseConfidenceClassification:
    """Tests for pose estimation confidence threshold (0.60 threshold boundary)."""

    @pytest.mark.parametrize("conf,expected_usable", [
        (1.0, True),
        (0.80, True),
        (0.60, True),
        (0.599, False),
        (0.59, False),
        (0.40, False),
        (0.0, False),
    ])
    def test_pose_confidence_threshold_boundary(self, conf: float, expected_usable: bool):
        """Pose confidence >= 0.60 is usable; < 0.60 is disqualified."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.90,
            "pose_confidence": conf,
        })
        assert res.usable is expected_usable
        if not expected_usable:
            assert res.cue_away is False
            assert "LOW_CONFIDENCE" in res.technical_reasons

    def test_low_pose_confidence_with_away_cue_never_cues_away(self):
        """Invariant 4: Low confidence pose estimation never contributes attention cues."""
        res = UsableSegmentClassifier.classify({
            "pose_confidence": 0.45,
            "yaw_deg": 40.0,
            "pitch_deg": 30.0,
            "cue_away": True,
        })
        assert res.usable is False
        assert res.cue_away is False
        assert "LOW_CONFIDENCE" in res.technical_reasons
        assert res.attention_reasons == []


@pytest.mark.unit
class TestNetworkAndSystemDisqualifications:
    """Tests for external network and system technical reasons."""

    @pytest.mark.parametrize("reason", [
        "NETWORK_DISCONNECTED",
        "NETWORK_DEGRADED",
        "CPU_OVERLOAD",
        "CONSENT_MISSING",
        "SYSTEM_BACKGROUND",
    ])
    def test_external_technical_reasons_disqualify_segment(self, reason: str):
        """External technical impairments disqualify segment and prevent attention cues."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
            "pose_confidence": 0.90,
            "yaw_deg": 35.0,
            "technical_reasons": [reason],
        })
        assert res.usable is False
        assert res.cue_away is False
        assert reason in res.technical_reasons
        assert res.attention_reasons == []

    def test_explicit_usable_false_flag(self):
        """Explicit usable=False with no existing technical reasons populates default reason."""
        res = UsableSegmentClassifier.classify({
            "usable": False,
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
        })
        assert res.usable is False
        assert res.cue_away is False
        assert "IMAGE_QUALITY_INSUFFICIENT" in res.technical_reasons

    def test_multiple_simultaneous_disqualifications_accumulate(self):
        """Multiple simultaneous impairments accumulate all distinct technical reasons."""
        res = UsableSegmentClassifier.classify({
            "camera_active": False,
            "face_count": 0,
            "quality_score": 0.40,
            "pose_confidence": 0.30,
            "technical_reasons": ["NETWORK_DISCONNECTED", "CPU_OVERLOAD"],
            "yaw_deg": 50.0,
        })
        assert res.usable is False
        assert res.cue_away is False
        expected_reasons = {
            "CAMERA_UNAVAILABLE",
            "NO_FACE_DETECTED",
            "IMAGE_QUALITY_INSUFFICIENT",
            "LOW_CONFIDENCE",
            "NETWORK_DISCONNECTED",
            "CPU_OVERLOAD",
        }
        assert expected_reasons.issubset(set(res.technical_reasons))
        assert res.attention_reasons == []


@pytest.mark.unit
class TestInvariant4TechnicalIntervalsNeverBecomeAttentionCues:
    """
    Invariant 4: Technical intervals never become attention cues.
    Comprehensive matrix of technical failure modes crossed with attention trigger conditions.
    """

    @pytest.mark.parametrize("tech_kwargs", [
        {"camera_active": False},
        {"face_count": 0},
        {"face_count": 2},
        {"face_count": 3},
        {"quality_score": 0.50},
        {"pose_confidence": 0.40},
        {"technical_reasons": ["NETWORK_DISCONNECTED"]},
        {"technical_reasons": ["NETWORK_DEGRADED"]},
        {"technical_reasons": ["CPU_OVERLOAD"]},
        {"technical_reasons": ["CONSENT_MISSING"]},
    ])
    @pytest.mark.parametrize("cue_kwargs", [
        {"yaw_deg": 35.0},
        {"yaw_deg": -45.0},
        {"pitch_deg": 25.0},
        {"pitch_deg": -30.0},
        {"orientation_away": True},
        {"cue_away": True},
        {"attention_reasons": ["ORIENTATION_AWAY"]},
    ])
    def test_invariant_4_matrix(self, tech_kwargs: Dict[str, Any], cue_kwargs: Dict[str, Any]):
        """Every combination of technical disqualification + cue attempt MUST yield usable=False, cue_away=False."""
        payload = {
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
            "pose_confidence": 0.90,
        }
        payload.update(tech_kwargs)
        payload.update(cue_kwargs)

        res = UsableSegmentClassifier.classify(payload)
        assert res.usable is False, f"Expected usable=False for payload {payload}"
        assert res.cue_away is False, f"Expected cue_away=False for payload {payload}"
        assert res.attention_reasons == [], f"Expected empty attention_reasons for payload {payload}"
        assert len(res.technical_reasons) >= 1, f"Expected non-empty technical_reasons for payload {payload}"


@pytest.mark.unit
class TestInvariant5PageHiddenNeverEntersAttentionExposure:
    """
    Invariant 5: PAGE_HIDDEN / browser blur never enters attention exposure.
    Usable is True (browser telemetry is active), but cue_away is False and attention reasons empty.
    """

    def test_browser_context_page_hidden_never_cues_away(self):
        """browser_context='PAGE_HIDDEN' results in usable=True, cue_away=False."""
        res = UsableSegmentClassifier.classify({
            "browser_context": "PAGE_HIDDEN",
            "quality_score": 0.95,
            "yaw_deg": 40.0,
            "pitch_deg": 25.0,
            "orientation_away": True,
        })
        assert res.usable is True
        assert res.cue_away is False
        assert res.attention_reasons == []
        assert res.technical_reasons == []

    def test_is_page_hidden_boolean_flag_never_cues_away(self):
        """is_page_hidden=True results in usable=True, cue_away=False."""
        res = UsableSegmentClassifier.classify({
            "is_page_hidden": True,
            "quality_score": 0.90,
            "yaw_deg": -50.0,
            "cue_away": True,
        })
        assert res.usable is True
        assert res.cue_away is False
        assert res.attention_reasons == []

    def test_window_evaluator_page_hidden_segments_never_create_warning(self):
        """A full window of PAGE_HIDDEN segments evaluates to VALID_CLEAN with 0.0 cue exposure."""
        cfg = get_config(is_demo=False)
        # 12 usable segments, all with PAGE_HIDDEN and yaw=40.0
        segments = [
            {"browser_context": "PAGE_HIDDEN", "yaw_deg": 40.0, "quality_score": 0.95}
            for _ in range(12)
        ]
        res = WindowEvaluator.evaluate_segments(segments, config=cfg)
        assert res["observation_state"] == "VALID"
        assert res["classification"] == "VALID_CLEAN"
        assert res["cue_exposure_seconds"] == 0.0
        assert res["reason_codes"] == []


@pytest.mark.unit
class TestInvariant6IdentityResultNeverAltersAttention:
    """
    Invariant 6: Identity result events (IDENTITY_RESULT) never alter attention score or streaks.
    """

    @pytest.mark.parametrize("id_state", [
        IdentityState.LOW_CONFIDENCE.value,
        IdentityState.QUALITY_FAIL.value,
        IdentityState.MISMATCH.value,
        IdentityState.UNAVAILABLE.value,
        IdentityState.VERIFIED.value,
        IdentityState.CHECKING.value,
    ])
    def test_identity_results_do_not_affect_state_machine(self, id_state: str):
        """Identity evaluation events do not modify observation state machine streaks or patterns."""
        sm = ObservationStateMachine(is_demo=False)

        # 1. Establish warning streak = 2
        sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"})
        sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_WARNING"})
        assert sm.warning_streak == 2
        assert sm.case_state == "MONITOR"
        assert sm.attention_pattern == "VARIABLE"

        # 2. Simulate receipt of IDENTITY_RESULT event
        # Identity payload is an external verification event, not a window evaluation payload
        identity_payload = IdentityResultPayload(
            check_id="chk-001",
            identity_state=id_state,
            confidence_score=0.42 if id_state != "VERIFIED" else 0.99,
            quality_score=0.50,
            failure_reason="Face landmark disparity" if id_state != "VERIFIED" else None,
        ).model_dump()

        # Verify state machine state is completely unaffected
        assert sm.warning_streak == 2
        assert sm.case_state == "MONITOR"
        assert sm.attention_pattern == "VARIABLE"

        # 3. Subsequent valid clean window increments clean streak normally
        res = sm.evaluate_window({"observation_state": "VALID", "classification": "VALID_CLEAN"})
        assert res["warning_streak"] == 2
        assert res["clean_streak"] == 1


@pytest.mark.unit
class TestHeadPoseAngleThresholdsAndUsability:
    """Tests for head pose angle thresholds (Yaw 25 deg, Pitch 20 deg)."""

    @pytest.mark.parametrize("yaw,expected_cue", [
        (0.0, False),
        (10.0, False),
        (24.9, False),
        (25.0, True),
        (25.1, True),
        (45.0, True),
        (-24.9, False),
        (-25.0, True),
        (-25.1, True),
        (-60.0, True),
    ])
    def test_yaw_away_threshold_boundary(self, yaw: float, expected_cue: bool):
        """|yaw| >= 25.0 deg triggers ORIENTATION_AWAY cue; < 25.0 does not."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
            "pose_confidence": 0.90,
            "yaw_deg": yaw,
            "pitch_deg": 0.0,
        })
        assert res.usable is True
        assert res.cue_away is expected_cue
        if expected_cue:
            assert "ORIENTATION_AWAY" in res.attention_reasons
        else:
            assert res.attention_reasons == []

    @pytest.mark.parametrize("pitch,expected_cue", [
        (0.0, False),
        (10.0, False),
        (19.9, False),
        (20.0, True),
        (20.1, True),
        (35.0, True),
        (-19.9, False),
        (-20.0, True),
        (-20.1, True),
        (-40.0, True),
    ])
    def test_pitch_away_threshold_boundary(self, pitch: float, expected_cue: bool):
        """|pitch| >= 20.0 deg triggers ORIENTATION_AWAY cue; < 20.0 does not."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.95,
            "pose_confidence": 0.90,
            "yaw_deg": 0.0,
            "pitch_deg": pitch,
        })
        assert res.usable is True
        assert res.cue_away is expected_cue
        if expected_cue:
            assert "ORIENTATION_AWAY" in res.attention_reasons
        else:
            assert res.attention_reasons == []

    def test_neutral_pose_is_clean(self):
        """Within thresholds is clean with usable=True and cue_away=False."""
        res = UsableSegmentClassifier.classify({
            "yaw_deg": 12.0,
            "pitch_deg": -8.0,
            "roll_deg": 3.0,
        })
        assert res.usable is True
        assert res.cue_away is False
        assert res.attention_reasons == []

    def test_explicit_orientation_away_flag(self):
        """Explicit orientation_away=True forces cue_away=True even if angles are 0.0."""
        res = UsableSegmentClassifier.classify({
            "orientation_away": True,
            "yaw_deg": 0.0,
            "pitch_deg": 0.0,
        })
        assert res.usable is True
        assert res.cue_away is True
        assert "ORIENTATION_AWAY" in res.attention_reasons

    def test_explicit_cue_away_flag(self):
        """Explicit cue_away=True forces cue_away=True even if angles are 0.0."""
        res = UsableSegmentClassifier.classify({
            "cue_away": True,
            "yaw_deg": 0.0,
            "pitch_deg": 0.0,
        })
        assert res.usable is True
        assert res.cue_away is True
        assert "ORIENTATION_AWAY" in res.attention_reasons


@pytest.mark.unit
class TestContractCompatibilityAndToDict:
    """Tests for Pydantic schema interop and result dictionary formatting."""

    def test_classify_pydantic_observation_sample_payload(self):
        """Accepts ObservationSamplePayload instance directly."""
        payload = ObservationSamplePayload(
            sample_id="samp-001",
            sample_index=1,
            usable=True,
            camera_active=True,
            face_count=1,
            quality_score=0.92,
            pose_confidence=0.88,
            yaw_deg=30.0,
            pitch_deg=0.0,
        )
        res = UsableSegmentClassifier.classify(payload)
        assert res.usable is True
        assert res.cue_away is True
        assert "ORIENTATION_AWAY" in res.attention_reasons

    def test_to_dict_format(self):
        """to_dict produces all expected fields with correct types."""
        res = UsableSegmentClassifier.classify({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.85,
            "pose_confidence": 0.80,
            "yaw_deg": 28.0,
            "pitch_deg": 5.0,
            "roll_deg": 2.0,
        })
        d = res.to_dict()
        assert isinstance(d, dict)
        assert d["usable"] is True
        assert d["cue_away"] is True
        assert d["technical_reasons"] == []
        assert d["attention_reasons"] == ["ORIENTATION_AWAY"]
        assert d["face_count"] == 1
        assert d["quality_score"] == 0.85
        assert d["pose_confidence"] == 0.80
        assert d["yaw_deg"] == 28.0
        assert d["pitch_deg"] == 5.0
        assert d["roll_deg"] == 2.0
