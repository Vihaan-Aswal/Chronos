"""
Chronos Synthetic Domain Fixture Factories
Provides deterministic, synthetic data objects for tests without real PII or live credentials.
"""

from typing import Any, Dict, List, Optional
import hashlib
import uuid


def make_synthetic_tenant(
    tenant_id: str = "ten-00000001",
    name: str = "Synthetic Test University",
) -> Dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "name": name,
        "created_at": "2026-08-20T10:00:00Z",
    }


def make_synthetic_user(
    user_id: str = "usr-00000001",
    tenant_id: str = "ten-00000001",
    role: str = "student",
    name: str = "Synthetic Student",
) -> Dict[str, Any]:
    return {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "name": name,
        "email": f"{user_id}@synthetic.example.com",
    }


def make_synthetic_session(
    session_id: str = "ses-00000001",
    tenant_id: str = "ten-00000001",
    teacher_id: str = "usr-teacher-01",
    policy_id: str = "RESOURCE_SUPPORTED_ASSESSMENT",
    policy_version: str = "assessment-v1",
    is_demo: bool = False,
    status: str = "ACTIVE",
) -> Dict[str, Any]:
    return {
        "session_id": session_id,
        "tenant_id": tenant_id,
        "teacher_id": teacher_id,
        "policy_id": policy_id,
        "policy_version": policy_version,
        "is_demo": is_demo,
        "status": status,
        "started_at": "2026-08-20T10:00:00Z",
        "ended_at": None,
    }


def make_synthetic_observation_segment(
    usable: bool = True,
    face_count: int = 1,
    quality_score: float = 0.95,
    yaw_deg: float = 0.0,
    pitch_deg: float = 0.0,
    cue_away: bool = False,
) -> Dict[str, Any]:
    return {
        "usable": usable and face_count == 1 and quality_score >= 0.7,
        "face_count": face_count,
        "quality_score": quality_score,
        "yaw_deg": yaw_deg,
        "pitch_deg": pitch_deg,
        "cue_away": cue_away,
    }


def make_synthetic_window(
    window_id: str = "win-00000001",
    is_demo: bool = False,
    coverage_ratio: float = 1.0,
    classification: str = "VALID_CLEAN",
    cue_exposure_seconds: int = 4,
    warning_streak: int = 0,
    clean_streak: int = 1,
) -> Dict[str, Any]:
    expected = 10 if is_demo else 12
    threshold = 0.80 if is_demo else 0.75
    usable = int(expected * coverage_ratio)
    is_valid = coverage_ratio >= threshold

    obs_state = "VALID" if is_valid else "NO_DATA"
    window_class = classification if is_valid else "NOT_EVALUATED"

    return {
        "window_id": window_id,
        "expected_segments": expected,
        "usable_segments": usable,
        "coverage_ratio": coverage_ratio,
        "observation_state": obs_state,
        "classification": window_class,
        "cue_exposure_seconds": cue_exposure_seconds if is_valid else 0,
        "warning_streak": warning_streak if is_valid else 0,
        "clean_streak": clean_streak if is_valid else 0,
        "reason_codes": ["ORIENTATION_AWAY"] if window_class == "VALID_WARNING" else [],
        "technical_reasons": ["CAMERA_UNAVAILABLE"] if not is_valid else [],
    }


def make_synthetic_active_presence_challenge(
    challenge_id: str = "apc-00000001",
    session_id: str = "ses-00000001",
    participant_id: str = "usr-00000001",
    actions: Optional[List[str]] = None,
    expires_in_sec: int = 15,
) -> Dict[str, Any]:
    if actions is None:
        actions = ["TURN_LEFT", "LOOK_UP"]
    return {
        "challenge_id": challenge_id,
        "session_id": session_id,
        "participant_id": participant_id,
        "actions": actions,
        "max_attempts": 2,
        "expires_in_sec": expires_in_sec,
        "status": "REQUESTED",
        "created_at": "2026-08-20T10:00:00Z",
    }


def make_synthetic_answer_submission(
    submission_id: str = "sub-00000001",
    session_id: str = "ses-00000001",
    participant_id: str = "usr-00000001",
    version: int = 1,
    content_raw: str = "Synthetic student answer content...",
    is_late: bool = False,
) -> Dict[str, Any]:
    content_hash = hashlib.sha256(content_raw.encode("utf-8")).hexdigest()
    return {
        "submission_id": submission_id,
        "session_id": session_id,
        "participant_id": participant_id,
        "version": version,
        "size_bytes": len(content_raw.encode("utf-8")),
        "content_hash": f"sha256:{content_hash}",
        "status": "LATE" if is_late else "SUBMITTED",
        "submitted_at": "2026-08-20T10:30:00Z",
    }


def make_synthetic_embedding(seed_val: float = 0.05) -> List[float]:
    """Create a unit-normalized 128-d synthetic embedding vector."""
    raw = [seed_val] * 128
    norm = (sum(x * x for x in raw)) ** 0.5
    return [x / norm for x in raw]
