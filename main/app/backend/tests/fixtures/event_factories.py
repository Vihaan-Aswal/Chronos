"""
tests/fixtures/event_factories.py
Deterministic Event Envelope and Domain Payload Builders for Workstream W2.
"""
from typing import Dict, Any, List, Optional
import hashlib
import uuid


def make_event_envelope(
    event_id: Optional[str] = None,
    event_type: str = "OBSERVATION_SAMPLE",
    tenant_id: str = "ten-00000001",
    session_id: str = "ses-00000001",
    participant_id: str = "usr-student-001",
    actor_id: Optional[str] = None,
    actor_role: str = "participant",
    source: str = "browser",
    occurred_at: str = "2026-08-20T10:00:00Z",
    received_at: str = "2026-08-20T10:00:01Z",
    server_sequence: Optional[int] = 1,
    correlation_id: Optional[str] = None,
    causation_id: Optional[str] = None,
    policy_id: str = "RESOURCE_SUPPORTED_ASSESSMENT",
    policy_version: str = "assessment-v1",
    model_versions: Optional[Dict[str, str]] = None,
    is_demo: bool = False,
    payload: Optional[Dict[str, Any]] = None,
    schema_version: int = 1,
) -> Dict[str, Any]:
    """Generates the canonical 19-field event envelope."""
    evt_id = event_id or str(uuid.uuid4())
    act_id = actor_id or participant_id
    corr_id = correlation_id or str(uuid.uuid4())
    caus_id = causation_id or corr_id

    # Prohibited payload validation
    prohibited_keys = {
        "raw_frame", "frame_base64", "continuous_landmarks", 
        "face_crop", "password", "jwt_token", "api_key",
        "landmarks", "embeddings", "embedding"
    }
    safe_payload = payload or {}
    if any(k in safe_payload for k in prohibited_keys):
        raise ValueError("Prohibited sensitive payload keys detected in fixture builder")

    return {
        "event_id": evt_id,
        "event_type": event_type,
        "schema_version": schema_version,
        "tenant_id": tenant_id,
        "session_id": session_id,
        "participant_id": participant_id,
        "actor_id": act_id,
        "actor_role": actor_role,
        "source": source,
        "occurred_at": occurred_at,
        "received_at": received_at,
        "server_sequence": server_sequence,
        "correlation_id": corr_id,
        "causation_id": caus_id,
        "policy_id": policy_id,
        "policy_version": policy_version,
        "model_versions": model_versions or {"face_detector": "v1.2", "pose_estimator": "v2.0"},
        "is_demo": is_demo,
        "payload": safe_payload,
    }


def make_synthetic_observation_sample_payload(
    sample_index: int = 0,
    camera_active: bool = True,
    face_count: int = 1,
    quality_score: float = 0.95,
    yaw_deg: float = 0.0,
    pitch_deg: float = 0.0,
    cue_away: bool = False,
    technical_reasons: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Payload for OBSERVATION_SAMPLE event (5s heartbeat)."""
    usable = camera_active and (face_count == 1) and (quality_score >= 0.70)
    return {
        "sample_index": sample_index,
        "usable": usable,
        "camera_active": camera_active,
        "face_count": face_count,
        "quality_score": round(quality_score, 3),
        "yaw_deg": round(yaw_deg, 1),
        "pitch_deg": round(pitch_deg, 1),
        "cue_away": cue_away,
        "technical_reasons": technical_reasons or ([] if usable else ["CAMERA_POOR_QUALITY"]),
    }


def make_synthetic_window_finalized_payload(
    window_id: str = "win-00000001",
    window_start: str = "2026-08-20T10:00:00Z",
    window_end: str = "2026-08-20T10:01:00Z",
    is_demo: bool = False,
    coverage_ratio: float = 1.0,
    classification: str = "VALID_CLEAN",
    cue_exposure_seconds: int = 4,
    warning_streak: int = 0,
    clean_streak: int = 1,
    reason_codes: Optional[List[str]] = None,
    technical_reasons: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Payload for WINDOW_FINALIZED event (60s in real, 10s in demo)."""
    expected = 10 if is_demo else 12
    threshold = 0.80 if is_demo else 0.75
    usable = int(expected * coverage_ratio)
    is_valid = coverage_ratio >= threshold

    obs_state = "VALID" if is_valid else "NO_DATA"
    window_class = classification if is_valid else "NOT_EVALUATED"

    return {
        "window_id": window_id,
        "window_start": window_start,
        "window_end": window_end,
        "expected_segments": expected,
        "usable_segments": usable,
        "coverage_ratio": round(coverage_ratio, 2),
        "observation_state": obs_state,
        "classification": window_class,
        "cue_exposure_seconds": cue_exposure_seconds if is_valid else 0,
        "warning_streak": warning_streak if is_valid else 0,
        "clean_streak": clean_streak if is_valid else 0,
        "reason_codes": reason_codes or (["ORIENTATION_AWAY"] if window_class == "VALID_WARNING" else []),
        "technical_reasons": technical_reasons or (["CAMERA_UNAVAILABLE"] if not is_valid else []),
    }


def make_synthetic_presence_challenge_payload(
    challenge_id: str = "apc-00000001",
    session_id: str = "ses-00000001",
    participant_id: str = "usr-student-001",
    actions: Optional[List[str]] = None,
    expires_in_sec: int = 15,
) -> Dict[str, Any]:
    """Payload for ACTIVE_PRESENCE_REQUESTED."""
    return {
        "challenge_id": challenge_id,
        "session_id": session_id,
        "participant_id": participant_id,
        "actions": actions or ["TURN_LEFT", "LOOK_UP"],
        "max_attempts": 2,
        "expires_in_sec": expires_in_sec,
        "status": "REQUESTED",
    }


def make_synthetic_browser_visibility_payload(
    event_type: str = "PAGE_HIDDEN",
    started_at: str = "2026-08-20T10:15:00Z",
    ended_at: Optional[str] = "2026-08-20T10:15:42Z",
    duration_ms: int = 42000,
    associated_resource_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Payload for PAGE_HIDDEN / PAGE_VISIBLE."""
    return {
        "visibility_state": "HIDDEN" if event_type == "PAGE_HIDDEN" else "VISIBLE",
        "started_at": started_at,
        "ended_at": ended_at,
        "duration_ms": duration_ms,
        "destination_known": False,
        "associated_declared_resource_id": associated_resource_id,
    }


def make_synthetic_resource_payload(
    resource_id: str = "res-00000001",
    session_id: str = "ses-00000001",
    resource_type: str = "uploaded_pdf",
    title: str = "Final Examination Paper",
    is_required: bool = True,
    file_bytes: bytes = b"%PDF-1.4 Mock exam question paper content...",
) -> Dict[str, Any]:
    """Payload for RESOURCE_PUBLISHED."""
    content_hash = hashlib.sha256(file_bytes).hexdigest()
    return {
        "resource_id": resource_id,
        "session_id": session_id,
        "type": resource_type,
        "title": title,
        "description": "Primary examination question paper",
        "storage_path": f"/tenants/ten-1/sessions/{session_id}/resources/{resource_id}.pdf",
        "required": is_required,
        "immutable_after_start": True,
        "size_bytes": len(file_bytes),
        "content_hash": f"sha256:{content_hash}",
    }


def make_synthetic_answer_payload(
    submission_id: str = "sub-00000001",
    session_id: str = "ses-00000001",
    participant_id: str = "usr-student-001",
    version: int = 1,
    answer_text: str = "Synthetic student solution text...",
    is_late: bool = False,
) -> Dict[str, Any]:
    """Payload for ANSWER_SUBMITTED."""
    content_hash = hashlib.sha256(answer_text.encode("utf-8")).hexdigest()
    return {
        "submission_id": submission_id,
        "session_id": session_id,
        "participant_id": participant_id,
        "version": version,
        "size_bytes": len(answer_text.encode("utf-8")),
        "content_hash": f"sha256:{content_hash}",
        "status": "LATE" if is_late else "SUBMITTED",
    }


def make_synthetic_case_payload(
    case_id: str = "case-00000001",
    session_id: str = "ses-00000001",
    participant_id: str = "usr-student-001",
    category: str = "ATTENTION_CONCERN",
    status: str = "MONITOR",
    event_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Payload for CASE_CREATED / CASE_UPDATED."""
    return {
        "case_id": case_id,
        "session_id": session_id,
        "participant_id": participant_id,
        "category": category,
        "status": status,
        "priority": "MEDIUM",
        "event_ids": event_ids or ["evt-001", "evt-002"],
        "student_context_count": 0,
        "teacher_action_count": 0,
        "self_recovery_attempted": True,
    }
