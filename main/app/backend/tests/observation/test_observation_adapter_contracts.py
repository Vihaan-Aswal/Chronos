"""
Chronos Local Observation Adapter Contract Test Suite
Workstream W4: Local Observation, Browser Context, and Active Presence
Specifications: LOGIC_AND_EVENT_SPEC.md §2, QUALITY_REQUIREMENTS.md §1
"""
import uuid
import pytest
from datetime import datetime, timezone

from contracts import EventEnvelope, EventType, ObservationSamplePayload
from observation.classifier import UsableSegmentClassifier
from tests.fixtures.event_factories import make_synthetic_observation_sample_payload


@pytest.mark.contract
class TestObservationAdapterContracts:
    """Contract tests verifying normalized observation heartbeats and segment usability rules."""

    def test_canonical_observation_sample_payload_schema(self):
        """ObservationSamplePayload must support all normalized observation metrics."""
        p = ObservationSamplePayload(
            sample_id=str(uuid.uuid4()),
            sample_index=1,
            timestamp=datetime.now(timezone.utc).isoformat(),
            usable=True,
            camera_active=True,
            face_count=1,
            quality_score=0.92,
            pose_confidence=0.95,
            orientation_away=False,
            cue_away=False,
            yaw_deg=-4.5,
            pitch_deg=2.1,
            roll_deg=0.8,
            technical_reasons=[],
            attention_reasons=[],
            local_processing_ms=18.4,
        )
        assert p.usable is True
        assert p.quality_score == 0.92
        assert p.yaw_deg == -4.5

    def test_disqualified_zero_face_segment(self):
        """Zero faces detected disqualifies segment with NO_FACE_DETECTED and cue_away=False."""
        result = UsableSegmentClassifier.classify_segment({
            "camera_active": True,
            "face_count": 0,
            "quality_score": 0.0,
            "pose_confidence": 0.0,
        })
        assert result.usable is False
        assert result.cue_away is False
        assert "NO_FACE_DETECTED" in result.technical_reasons

    def test_disqualified_multiple_faces_segment(self):
        """Multiple faces detected disqualifies segment with MULTIPLE_FACES_DETECTED."""
        result = UsableSegmentClassifier.classify_segment({
            "camera_active": True,
            "face_count": 2,
            "quality_score": 0.90,
            "pose_confidence": 0.90,
        })
        assert result.usable is False
        assert result.cue_away is False
        assert "MULTIPLE_FACES_DETECTED" in result.technical_reasons

    def test_disqualified_insufficient_quality_segment(self):
        """Quality score < 0.70 (e.g. blur / lighting) disqualifies segment."""
        result = UsableSegmentClassifier.classify_segment({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.45,
            "pose_confidence": 0.90,
        })
        assert result.usable is False
        assert result.cue_away is False
        assert "IMAGE_QUALITY_INSUFFICIENT" in result.technical_reasons

    def test_disqualified_camera_inactive_or_permission_denied(self):
        """Inactive camera or permission denied emits clear technical reasons."""
        res_unavail = UsableSegmentClassifier.classify_segment({
            "camera_active": False,
            "face_count": 0,
        })
        assert res_unavail.usable is False
        assert "CAMERA_UNAVAILABLE" in res_unavail.technical_reasons

        res_perm = UsableSegmentClassifier.classify_segment({
            "camera_active": False,
            "face_count": 0,
            "technical_reasons": ["CAMERA_PERMISSION_DENIED"],
        })
        assert res_perm.usable is False
        assert "CAMERA_PERMISSION_DENIED" in res_perm.technical_reasons

    def test_valid_usable_head_pose_cues(self):
        """Usable segment with yaw >= 25 deg or pitch >= 20 deg produces qualified ORIENTATION_AWAY."""
        res_away = UsableSegmentClassifier.classify_segment({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.90,
            "pose_confidence": 0.90,
            "yaw_deg": 28.5,
            "pitch_deg": 5.0,
        })
        assert res_away.usable is True
        assert res_away.cue_away is True
        assert "ORIENTATION_AWAY" in res_away.attention_reasons

        res_centered = UsableSegmentClassifier.classify_segment({
            "camera_active": True,
            "face_count": 1,
            "quality_score": 0.90,
            "pose_confidence": 0.90,
            "yaw_deg": 5.0,
            "pitch_deg": 4.0,
        })
        assert res_centered.usable is True
        assert res_centered.cue_away is False
        assert res_centered.attention_reasons == []

    def test_observation_envelope_includes_model_versions(self):
        """EventEnvelope for OBSERVATION_SAMPLE includes model version metadata."""
        env = EventEnvelope(
            event_id=str(uuid.uuid4()),
            event_type="OBSERVATION_SAMPLE",
            schema_version=1,
            tenant_id="ten-01",
            session_id="ses-01",
            participant_id="usr-01",
            actor_id="usr-01",
            actor_role="participant",
            source="camera",
            occurred_at=datetime.now(timezone.utc).isoformat(),
            policy_id="CLASSROOM",
            model_versions={
                "face_landmarker": "mediapipe-v2",
                "embedder": "vladmandic-1.7.15",
                "adapter": "v1.0",
            },
            payload={
                "sample_id": str(uuid.uuid4()),
                "sample_index": 1,
                "usable": True,
                "camera_active": True,
                "face_count": 1,
                "quality_score": 0.95,
                "pose_confidence": 0.95,
                "orientation_away": False,
                "cue_away": False,
            },
        )
        assert env.model_versions["adapter"] == "v1.0"
        assert env.model_versions["face_landmarker"] == "mediapipe-v2"
