"""
Chronos Usable Segment Classifier
Domain Subsystem: Observation & State Machine
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union


@dataclass(frozen=True)
class SegmentClassificationResult:
    """Immutable result of single-segment observation evaluation."""
    usable: bool
    cue_away: bool
    technical_reasons: List[str] = field(default_factory=list)
    attention_reasons: List[str] = field(default_factory=list)
    face_count: int = 1
    quality_score: float = 1.0
    pose_confidence: float = 1.0
    yaw_deg: Optional[float] = None
    pitch_deg: Optional[float] = None
    roll_deg: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "usable": self.usable,
            "cue_away": self.cue_away,
            "technical_reasons": list(self.technical_reasons),
            "attention_reasons": list(self.attention_reasons),
            "face_count": self.face_count,
            "quality_score": self.quality_score,
            "pose_confidence": self.pose_confidence,
            "yaw_deg": self.yaw_deg,
            "pitch_deg": self.pitch_deg,
            "roll_deg": self.roll_deg,
        }


class UsableSegmentClassifier:
    """
    Pure, deterministic classifier that evaluates raw observation telemetry segments.
    Enforces domain invariants:
    - Technical impairments disqualify segments (usable = False).
    - Disqualified segments NEVER contribute attention cues (cue_away = False).
    - PAGE_HIDDEN / browser blur NEVER enters attention exposure.
    """

    MIN_QUALITY_SCORE: float = 0.70
    MIN_POSE_CONFIDENCE: float = 0.60
    YAW_AWAY_THRESHOLD_DEG: float = 25.0
    PITCH_AWAY_THRESHOLD_DEG: float = 20.0

    @classmethod
    def classify(cls, segment: Union[Dict[str, Any], Any]) -> SegmentClassificationResult:
        if hasattr(segment, "model_dump"):
            data = segment.model_dump()
        elif hasattr(segment, "dict"):
            data = segment.dict()
        elif isinstance(segment, dict):
            data = segment
        else:
            data = getattr(segment, "__dict__", {})

        # Extract fields with safe defaults
        camera_active = data.get("camera_active", True)
        face_count = data.get("face_count", 1)
        quality_score = float(data.get("quality_score", 1.0) if data.get("quality_score") is not None else 1.0)
        pose_conf_raw = data.get("pose_confidence")
        pose_confidence = float(pose_conf_raw) if pose_conf_raw is not None else 1.0
        
        yaw_deg = data.get("yaw_deg")
        pitch_deg = data.get("pitch_deg")
        roll_deg = data.get("roll_deg")
        orientation_away = bool(data.get("orientation_away", False))
        cue_away_flag = data.get("cue_away")
        browser_context = str(data.get("browser_context", ""))
        is_page_hidden = bool(data.get("is_page_hidden", False) or browser_context == "PAGE_HIDDEN")
        
        # Existing technical reasons passed in payload
        input_tech_reasons = list(data.get("technical_reasons") or [])
        input_att_reasons = list(data.get("attention_reasons") or [])

        # Explicit usability override if passed as False
        explicit_unusable = data.get("usable") is False

        technical_reasons: List[str] = []

        # 1. Camera check
        if not camera_active:
            if "CAMERA_PERMISSION_DENIED" in input_tech_reasons:
                technical_reasons.append("CAMERA_PERMISSION_DENIED")
            else:
                technical_reasons.append("CAMERA_UNAVAILABLE")

        # 2. Face count check
        if face_count == 0:
            technical_reasons.append("NO_FACE_DETECTED")
        elif face_count > 1:
            technical_reasons.append("MULTIPLE_FACES_DETECTED")

        # 3. Quality score check
        if quality_score < cls.MIN_QUALITY_SCORE:
            if "CAMERA_POOR_QUALITY" in input_tech_reasons:
                technical_reasons.append("CAMERA_POOR_QUALITY")
            else:
                technical_reasons.append("IMAGE_QUALITY_INSUFFICIENT")

        # 4. Pose confidence check
        if pose_confidence < cls.MIN_POSE_CONFIDENCE:
            technical_reasons.append("LOW_CONFIDENCE")

        # 5. External technical reasons
        for tr in input_tech_reasons:
            if tr not in technical_reasons:
                technical_reasons.append(tr)

        # 6. Explicit unusable check
        if explicit_unusable and not technical_reasons:
            technical_reasons.append("IMAGE_QUALITY_INSUFFICIENT")

        # If any disqualification applies:
        if technical_reasons:
            return SegmentClassificationResult(
                usable=False,
                cue_away=False,  # Invariant 4: Technical intervals never become attention cues
                technical_reasons=technical_reasons,
                attention_reasons=[],
                face_count=face_count,
                quality_score=quality_score,
                pose_confidence=pose_confidence,
                yaw_deg=yaw_deg,
                pitch_deg=pitch_deg,
                roll_deg=roll_deg,
            )

        # 7. Usable segment - determine cue_away
        # Invariant 5: PAGE_HIDDEN intervals NEVER enter attention exposure
        if is_page_hidden:
            return SegmentClassificationResult(
                usable=True,
                cue_away=False,
                technical_reasons=[],
                attention_reasons=[],
                face_count=face_count,
                quality_score=quality_score,
                pose_confidence=pose_confidence,
                yaw_deg=yaw_deg,
                pitch_deg=pitch_deg,
                roll_deg=roll_deg,
            )

        # Calculate head pose / cue away
        is_cue_away = False
        attention_reasons: List[str] = []

        if orientation_away:
            is_cue_away = True
            attention_reasons.append("ORIENTATION_AWAY")
        elif cue_away_flag is True:
            is_cue_away = True
            attention_reasons.append("ORIENTATION_AWAY")
        else:
            yaw_away = yaw_deg is not None and abs(float(yaw_deg)) >= cls.YAW_AWAY_THRESHOLD_DEG
            pitch_away = pitch_deg is not None and abs(float(pitch_deg)) >= cls.PITCH_AWAY_THRESHOLD_DEG
            if yaw_away or pitch_away:
                is_cue_away = True
                attention_reasons.append("ORIENTATION_AWAY")

        for ar in input_att_reasons:
            if ar not in attention_reasons and is_cue_away:
                attention_reasons.append(ar)

        return SegmentClassificationResult(
            usable=True,
            cue_away=is_cue_away,
            technical_reasons=[],
            attention_reasons=attention_reasons if is_cue_away else [],
            face_count=face_count,
            quality_score=quality_score,
            pose_confidence=pose_confidence,
            yaw_deg=yaw_deg,
            pitch_deg=pitch_deg,
            roll_deg=roll_deg,
        )
