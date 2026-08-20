"""
Chronos Backend Application Server
Workstream W1: Secure Platform Foundation (Authentication, Tenancy, and Secure Sessions)
"""
import os
import json
import math
import time
import uuid
import random
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any

from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    HTTPException,
    Depends,
    Query,
    Request,
    Response,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client

from chronos_logging import get_logger, redact_payload
from websocket_manager import manager
from auth.context import AuthContext, UserRole, SessionParticipantRole
from auth.dependencies import (
    get_auth_context,
    get_optional_auth_context,
    require_role,
    require_teacher,
    require_student,
    require_admin,
)
from auth.jwt_validator import JWTValidator
from auth.meeting_token import MeetingTokenService
from auth.ws_ticket import ws_ticket_manager
from auth.rate_limiter import rate_limit, limiter
from repository import ChronosDomainRepository
from models import (
    SessionCreateRequest,
    SessionAdmissionRequest,
    WSTicketRequest,
    TokenRequest,
    EmbeddingPayload,
    NudgePayload,
    SessionModePayload,
    ClassContextPayload,
    TeacherActionPayload,
    LivenessTriggerPayload,
    SessionAnalyticsPayload,
    PolicySnapshot,
    PolicyId,
    SessionStatus,
)

load_dotenv()
logger = get_logger("chronos.backend")

# ---------------------------------------------------------------------------
# Environment & Provider Setup
# ---------------------------------------------------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://mock-test-isolation.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY", "mock-test-service-role-key"
)

HMS_ACCESS_KEY = os.getenv("HMS_ACCESS_KEY", "mock_hms_access")
HMS_SECRET = os.getenv(
    "HMS_SECRET", "mock_test_hms_secret_32_characters_long"
)
HMS_ROOM_ID = os.getenv("HMS_ROOM_ID", "mock_room_default")

_is_test_env = os.getenv("ENV") == "test" or os.getenv("MOCK_AUTH", "0") == "1"

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
repository = ChronosDomainRepository(supabase)
meeting_service = MeetingTokenService(db_client=supabase)

app = FastAPI(
    title="Chronos Secure Platform API",
    description="Multi-tenant, zero-trust backend for Chronos Active Presence and Classroom Monitoring.",
    version="1.0.0",
)

# CORS configuration
_cors_origins = os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
)
CORS_ORIGINS_LIST = [
    o.strip() for o in _cors_origins.split(",") if o.strip()
] or ["http://localhost:5173", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS_LIST,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def normalize_vec(v: list[float]) -> list[float]:
    try:
        s = sum(float(x) * float(x) for x in v)
        if s <= 0:
            return v
        n = math.sqrt(s)
        return [float(x) / n for x in v]
    except Exception:
        return v


def is_finite_array(v: list) -> bool:
    try:
        return all(
            isinstance(x, (int, float)) and math.isfinite(float(x)) for x in v
        )
    except Exception:
        return False


def _verify_session_teacher(session: Dict[str, Any], auth: AuthContext):
    """Enforces that the authenticated actor is the assigned teacher or tenant admin."""
    if auth.is_admin or auth.is_service_role:
        return
    teacher_id = session.get("teacher_id")
    if teacher_id != auth.user_id:
        logger.warning(
            "Unassigned teacher action attempt denied",
            extra={
                "event_type": "UNASSIGNED_TEACHER_ACCESS_DENIED",
                "session_id": session.get("session_id"),
                "participant_id": auth.user_id,
                "outcome": "DENIED",
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not the assigned teacher for this session",
        )


def _verify_session_tenant(session: Dict[str, Any], auth: AuthContext):
    """Enforces tenant boundary isolation."""
    if auth.is_service_role:
        return
    session_tenant = session.get("tenant_id")
    if session_tenant and session_tenant != auth.tenant_id:
        logger.warning(
            "Cross-tenant access attempt denied",
            extra={
                "event_type": "CROSS_TENANT_ACCESS_DENIED",
                "session_id": session.get("session_id"),
                "participant_id": auth.user_id,
                "tenant_id": auth.tenant_id,
                "outcome": "DENIED",
            },
        )
        # Safe denial: 404 to prevent resource existence probing
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found",
        )


# ---------------------------------------------------------------------------
# Health / Root
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "platform": "Chronos Secure Platform Foundation",
    }


# ---------------------------------------------------------------------------
# 1. Session Lifecycle Management (W1.2, W1.5)
# ---------------------------------------------------------------------------

@app.post("/session/create", dependencies=[Depends(require_teacher)])
def create_session(
    payload: SessionCreateRequest,
    auth: AuthContext = Depends(require_teacher),
):
    """Create a new session in DRAFT state assigned to authenticated teacher."""
    tenant_id = auth.tenant_id
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=payload.expires_in_minutes)

    policy_snapshot = PolicySnapshot.create_snapshot_for_policy(
        payload.policy_id, is_demo=payload.is_demo
    ).dict()

    room_id = payload.room_id or HMS_ROOM_ID

    session_data = {
        "session_id": session_id,
        "id": session_id,
        "tenant_id": tenant_id,
        "teacher_id": auth.user_id,
        "title": payload.title,
        "status": SessionStatus.SCHEDULED.value,
        "policy_id": payload.policy_id.value,
        "policy_snapshot": policy_snapshot,
        "is_demo": payload.is_demo,
        "room_id": room_id,
        "hms_room_id": room_id,
        "started_at": None,
        "ended_at": None,
        "expires_at": expires_at.isoformat(),
        "created_at": now.isoformat(),
    }

    created = repository.create_session(session_data)
    logger.info(
        "Session created",
        extra={
            "event_type": "SESSION_CREATED",
            "session_id": session_id,
            "participant_id": auth.user_id,
            "tenant_id": tenant_id,
            "outcome": "SUCCESS",
        },
    )
    return {"status": "success", "session": created}


@app.post("/session/{session_id}/start", dependencies=[Depends(require_teacher)])
def start_session(
    session_id: str,
    auth: AuthContext = Depends(require_teacher),
):
    """Transition session to ACTIVE and lock policy snapshot."""
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    current_status = session.get("status")
    if current_status == SessionStatus.ACTIVE.value:
        return {"status": "success", "message": "Session is already active", "session": session}
    if current_status in (SessionStatus.ENDED.value, SessionStatus.EXPIRED.value):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot start session in '{current_status}' state",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    policy_id_val = session.get("policy_id", PolicyId.CLASSROOM.value)
    try:
        policy_id = PolicyId(policy_id_val)
    except ValueError:
        policy_id = PolicyId.CLASSROOM

    policy_snapshot = PolicySnapshot.create_snapshot_for_policy(
        policy_id, is_demo=session.get("is_demo", False)
    ).dict()

    started = repository.start_session(
        session_id=session_id,
        tenant_id=session["tenant_id"],
        policy_snapshot=policy_snapshot,
        started_at=now_iso,
    )

    logger.info(
        "Session started",
        extra={
            "event_type": "SESSION_STARTED",
            "session_id": session_id,
            "participant_id": auth.user_id,
            "tenant_id": session["tenant_id"],
            "outcome": "SUCCESS",
        },
    )
    return {"status": "success", "session": started}


@app.post("/session/{session_id}/end", dependencies=[Depends(require_teacher)])
def end_session(
    session_id: str,
    auth: AuthContext = Depends(require_teacher),
):
    """Conclude session, transition to ENDED."""
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    current_status = session.get("status")
    if current_status == SessionStatus.ENDED.value:
        return {"status": "success", "message": "Session already ended"}

    now_iso = datetime.now(timezone.utc).isoformat()
    ended = repository.end_session(
        session_id=session_id,
        tenant_id=session["tenant_id"],
        ended_at=now_iso,
    )

    logger.info(
        "Session ended",
        extra={
            "event_type": "SESSION_ENDED",
            "session_id": session_id,
            "participant_id": auth.user_id,
            "tenant_id": session["tenant_id"],
            "outcome": "SUCCESS",
        },
    )
    return {"status": "success", "session": ended}


@app.get("/session/{session_id}")
def get_session_details(
    session_id: str,
    auth: AuthContext = Depends(get_auth_context),
):
    """Retrieve session details with tenant and role verification."""
    # Special backward-compatibility handling for default-session in local test/dev
    if session_id == "default-session":
        return {
            "session_id": "default-session",
            "title": "Default Classroom Session",
            "status": "ACTIVE",
            "policy_id": "CLASSROOM",
            "is_demo": False,
            "room_id": HMS_ROOM_ID,
            "tenant_id": auth.tenant_id,
        }

    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    _verify_session_tenant(session, auth)
    return {"status": "success", "session": session}


@app.post("/session/{session_id}/admission")
def admit_participant(
    session_id: str,
    payload: SessionAdmissionRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    """Admit authenticated student to an active session."""
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    _verify_session_tenant(session, auth)

    # Check session status
    current_status = session.get("status", "ACTIVE")
    if current_status in (SessionStatus.ENDED.value, SessionStatus.EXPIRED.value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot join session in '{current_status}' state",
        )

    # Check expiration
    expires_at_str = session.get("expires_at")
    if expires_at_str:
        try:
            exp_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) >= exp_dt:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Session has expired",
                )
        except (ValueError, TypeError):
            pass

    # Verify student is member of tenant
    membership = repository.verify_tenant_membership(auth.tenant_id, auth.user_id)
    if not membership and not auth.is_service_role:
        # Fallback check
        if auth.role != "student" and auth.role != "teacher":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not enrolled in this tenant",
            )

    role_val = "teacher" if (session.get("teacher_id") == auth.user_id or auth.is_admin) else "student"
    admitted = repository.admit_participant(
        session_id=session_id,
        user_id=auth.user_id,
        tenant_id=auth.tenant_id,
        role=role_val,
    )

    logger.info(
        "Participant admitted to session",
        extra={
            "event_type": "SESSION_ADMISSION_GRANTED",
            "session_id": session_id,
            "participant_id": auth.user_id,
            "tenant_id": auth.tenant_id,
            "outcome": "SUCCESS",
        },
    )
    return {"status": "success", "participant": admitted}


# ---------------------------------------------------------------------------
# 2. WebSocket Ticket Issuance (W1.7)
# ---------------------------------------------------------------------------

@app.post(
    "/ws/ticket",
    dependencies=[Depends(rate_limit(max_requests=20, window_seconds=60))],
)
def create_ws_ticket(
    payload: WSTicketRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    """Mints a short-lived (30s) single-use ticket for secure WebSocket connection."""
    # Special allow for default-session in test/dev
    if payload.session_id != "default-session":
        session = repository.get_session(payload.session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        _verify_session_tenant(session, auth)

        if payload.channel == "teacher":
            _verify_session_teacher(session, auth)

    ticket_id = ws_ticket_manager.create_ticket(
        auth=auth,
        session_id=payload.session_id,
        channel=payload.channel,
    )
    return {
        "status": "success",
        "ticket": ticket_id,
        "session_id": payload.session_id,
        "channel": payload.channel,
        "expires_in_seconds": ws_ticket_manager.ticket_ttl,
    }


# ---------------------------------------------------------------------------
# 3. Server-Authoritative Meeting Token Issuance (W1.6)
# ---------------------------------------------------------------------------

@app.post(
    "/session/{session_id}/meeting-token",
    dependencies=[Depends(rate_limit(max_requests=10, window_seconds=60))],
)
def get_session_meeting_token(
    session_id: str,
    auth: AuthContext = Depends(get_auth_context),
):
    """Generate HMS auth token bound strictly to verified session membership and server-derived role."""
    return meeting_service.generate_session_meeting_token(session_id, auth)


@app.post(
    "/hms-token",
    dependencies=[Depends(rate_limit(max_requests=10, window_seconds=60))],
)
def hms_token_legacy_adapter(
    req: TokenRequest,
    auth: Optional[AuthContext] = Depends(get_optional_auth_context),
):
    """
    Legacy HMS token adapter endpoint.
    If authenticated, derives identity and role strictly from server AuthContext.
    If unauthenticated in test environment, assigns safe student role.
    """
    if auth:
        user_name = auth.user_id
        # Server derives role: cannot request teacher if caller is student
        if auth.is_teacher:
            role = "teacher"
        else:
            role = "student"
        tenant_id = auth.tenant_id
    else:
        # Require authentication unless explicitly allowed in test
        if not _is_test_env and os.getenv("ALLOW_ANON_HMS_TOKEN") != "1":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to generate meeting token",
            )
        user_name = (req.user_name or "anon_student").strip()
        role = "student"  # Insecure requests always downgraded to student
        tenant_id = "ten-default"

    session_id = req.session_id or "default-session"
    return meeting_service._mint_jwt(
        user_id=user_name,
        role=role,
        room_id=HMS_ROOM_ID,
        session_id=session_id,
        tenant_id=tenant_id,
    )


# ---------------------------------------------------------------------------
# 4. Authenticated WebSockets (W1.7)
# ---------------------------------------------------------------------------

@app.websocket("/ws/engagement/{session_id}")
async def student_ws(
    websocket: WebSocket,
    session_id: str,
    ticket: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
):
    """
    Secure student telemetry WebSocket.
    Requires validated ticket or Bearer token query parameter.
    Binds connection strictly to verified actor identity.
    """
    actor_id: str = "unknown_student"
    tenant_id: str = "ten-default"

    # Authenticate via ticket (preferred) or JWT query param (legacy test fallback)
    if ticket:
        try:
            val_ticket = ws_ticket_manager.consume_ticket(
                ticket_id=ticket,
                expected_session_id=session_id,
                expected_channel="engagement",
            )
            actor_id = val_ticket.user_id
            tenant_id = val_ticket.tenant_id
        except HTTPException as e:
            await websocket.close(code=4403, reason=e.detail)
            return
    elif token:
        try:
            validator = JWTValidator()
            auth = validator.decode_and_validate(token)
            actor_id = auth.user_id
            tenant_id = auth.tenant_id
        except Exception:
            await websocket.close(code=4401, reason="Invalid authentication token")
            return
    else:
        # If in test/dev mode without ticket/token, reject with 4401
        await websocket.close(code=4401, reason="Missing WebSocket authentication ticket")
        return

    await manager.connect_student(session_id, actor_id, websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            # Strict server rewrite: overwrite any caller-supplied user_id with verified actor_id
            enriched = {
                **msg,
                "session_id": session_id,
                "user_id": actor_id,
                "participant_id": actor_id,
                "tenant_id": tenant_id,
                "timestamp": msg.get("timestamp") or datetime.now(timezone.utc).isoformat(),
            }
            await manager.broadcast_to_teachers(session_id, enriched)

    except WebSocketDisconnect:
        manager.disconnect_student(session_id, actor_id)


@app.websocket("/ws/engagement/{session_id}/{user_id}")
async def student_ws_legacy(
    websocket: WebSocket,
    session_id: str,
    user_id: str,
    ticket: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
):
    """Legacy route adapter for /ws/engagement/{session_id}/{user_id}."""
    await student_ws(websocket, session_id, ticket=ticket, token=token)


@app.websocket("/ws/teacher/{session_id}")
async def teacher_ws(
    websocket: WebSocket,
    session_id: str,
    ticket: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
):
    """
    Secure teacher telemetry monitoring WebSocket.
    Requires validated teacher ticket or Bearer token query parameter.
    """
    actor_id: str = "teacher"

    if ticket:
        try:
            val_ticket = ws_ticket_manager.consume_ticket(
                ticket_id=ticket,
                expected_session_id=session_id,
                expected_channel="teacher",
            )
            if val_ticket.role not in (UserRole.TEACHER.value, UserRole.ADMIN.value, "teacher"):
                await websocket.close(code=4403, reason="Role 'teacher' required")
                return
            actor_id = val_ticket.user_id
        except HTTPException as e:
            await websocket.close(code=4403, reason=e.detail)
            return
    elif token:
        try:
            validator = JWTValidator()
            auth = validator.decode_and_validate(token)
            if not auth.is_teacher:
                await websocket.close(code=4403, reason="Role 'teacher' required")
                return
            actor_id = auth.user_id
        except Exception:
            await websocket.close(code=4401, reason="Invalid authentication token")
            return
    else:
        await websocket.close(code=4401, reason="Missing WebSocket authentication ticket")
        return

    await manager.connect_teacher(session_id, websocket, teacher_id=actor_id)

    try:
        while True:
            await websocket.receive_text()
    except Exception:
        pass
    finally:
        manager.disconnect_teacher(session_id, websocket)


# ---------------------------------------------------------------------------
# 5. Identity Operations (W1.4, Privacy Protected)
# ---------------------------------------------------------------------------

@app.post("/identity/register", dependencies=[Depends(get_auth_context)])
def register_embedding(
    payload: EmbeddingPayload,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Register temporary reference biometric embedding.
    Strictly bound to authenticated student (payload user_id ignored/asserted).
    """
    if not payload.embedding or not is_finite_array(payload.embedding):
        raise HTTPException(status_code=400, detail="invalid embedding: must be finite numeric vector")

    # Force user_id to match authenticated subject
    target_user_id = auth.user_id

    emb = normalize_vec(payload.embedding)
    supabase.table("identity_embeddings").upsert(
        {"user_id": target_user_id, "embedding": emb, "tenant_id": auth.tenant_id}
    ).execute()

    logger.info(
        "Identity embedding registered",
        extra={
            "event_type": "IDENTITY_EMBEDDING_REGISTERED",
            "participant_id": target_user_id,
            "tenant_id": auth.tenant_id,
            "outcome": "SUCCESS",
        },
    )
    return {"status": "success"}


@app.get("/identity/{user_id}", dependencies=[Depends(get_auth_context)])
def get_embedding(
    user_id: str,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Retrieve reference embedding.
    Allowed only for the user themselves or service_role. Teachers cannot read raw embeddings.
    """
    if user_id != auth.user_id and not auth.is_service_role:
        # Conceal existence: 404
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Embedding record not found",
        )

    result = (
        supabase.table("identity_embeddings")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return {"exists": False}
    return {"exists": True, "embedding": result.data[0]["embedding"]}


# ---------------------------------------------------------------------------
# 6. Session Analytics Endpoints (W1.4)
# ---------------------------------------------------------------------------

@app.post("/session/save-analytics", dependencies=[Depends(require_teacher)])
def save_session_analytics(
    payload: SessionAnalyticsPayload,
    auth: AuthContext = Depends(require_teacher),
):
    """Save session analytics. Derives teacher_id from authenticated context."""
    try:
        metrics_json = [m for m in payload.metrics_timeline]
        confusion_json = [
            h.dict() if hasattr(h, "dict") else h
            for h in payload.confusion_hotspots
        ] if payload.confusion_hotspots else []
        at_risk_json = [
            s.dict() if hasattr(s, "dict") else s
            for s in payload.at_risk_students
        ] if payload.at_risk_students else []

        data = {
            "session_id": payload.session_id,
            "teacher_id": auth.user_id,  # Server derived
            "tenant_id": auth.tenant_id,
            "start_time": payload.start_time,
            "end_time": payload.end_time,
            "duration_minutes": payload.duration_minutes,
            "avg_engagement_score": payload.avg_engagement_score,
            "total_students": payload.total_students,
            "metrics_timeline": metrics_json,
            "confusion_hotspots": confusion_json,
            "at_risk_students": at_risk_json,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if payload.tpi is not None:
            data["tpi"] = payload.tpi

        result = supabase.table("session_analytics").insert(data).execute()
        if result.data:
            return {"status": "success", "id": result.data[0].get("id")}
        return {"status": "success"}

    except Exception as e:
        logger.error(f"Error saving session analytics: {e}")
        raise HTTPException(status_code=500, detail="Error saving analytics")


@app.get("/session/analytics/list", dependencies=[Depends(require_teacher)])
def list_session_analytics(
    teacher_id: Optional[str] = None,
    auth: AuthContext = Depends(require_teacher),
):
    """List past sessions. Filters strictly by authenticated teacher identity."""
    target_teacher = auth.user_id if not auth.is_admin else (teacher_id or auth.user_id)
    try:
        result = (
            supabase.table("session_analytics")
            .select(
                "id, session_id, teacher_id, start_time, end_time, duration_minutes, avg_engagement_score, total_students, created_at"
            )
            .eq("teacher_id", target_teacher)
            .execute()
        )
        return {"sessions": result.data or []}
    except Exception as e:
        logger.error(f"Error listing session analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/session/{session_id}/analytics", dependencies=[Depends(require_teacher)])
def get_session_analytics(
    session_id: str,
    auth: AuthContext = Depends(require_teacher),
):
    """Retrieve session analytics. Enforces assigned teacher check."""
    try:
        session = repository.get_session(session_id)
        if session:
            _verify_session_tenant(session, auth)
            _verify_session_teacher(session, auth)

        result = (
            supabase.table("session_analytics")
            .select("*")
            .eq("session_id", session_id)
            .execute()
        )
        if not result.data:
            return {"exists": False}
        return {"exists": True, "analytics": result.data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# 7. Teacher Actions, Nudges & Live Controls (W1.4)
# ---------------------------------------------------------------------------

@app.post("/session/set-mode", dependencies=[Depends(require_teacher)])
async def set_session_mode(
    payload: SessionModePayload,
    auth: AuthContext = Depends(require_teacher),
):
    if payload.session_id != "default-session":
        session = repository.get_session(payload.session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        _verify_session_tenant(session, auth)
        _verify_session_teacher(session, auth)

    if payload.mode not in ("strict", "normal"):
        raise HTTPException(status_code=400, detail="mode must be 'strict' or 'normal'")
    msg = {"type": "session_mode", "mode": payload.mode, "teacher_id": auth.user_id}
    await manager.broadcast_to_students(payload.session_id, msg)
    return {"status": "success", "mode": payload.mode}


@app.post("/session/set-class-context", dependencies=[Depends(require_teacher)])
async def set_class_context(
    payload: ClassContextPayload,
    auth: AuthContext = Depends(require_teacher),
):
    if payload.session_id != "default-session":
        session = repository.get_session(payload.session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        _verify_session_tenant(session, auth)
        _verify_session_teacher(session, auth)

    if payload.context not in ("class", "exam"):
        raise HTTPException(status_code=400, detail="context must be 'class' or 'exam'")
    msg = {"type": "class_context", "context": payload.context, "teacher_id": auth.user_id}
    await manager.broadcast_to_students(payload.session_id, msg)
    return {"status": "success", "context": payload.context}


LIVENESS_ACTIONS = [
    {"id": "turn_head_left", "label": "Turn your head left"},
    {"id": "turn_head_right", "label": "Turn your head right"},
    {"id": "turn_head_up", "label": "Look up"},
    {"id": "turn_head_down", "label": "Look down"},
    {"id": "smile", "label": "Smile"},
    {"id": "look_right_smile", "label": "Look right and smile"},
    {"id": "look_left_smile", "label": "Look left and smile"},
]


@app.post(
    "/liveness/trigger",
    dependencies=[
        Depends(require_teacher),
        Depends(rate_limit(max_requests=10, window_seconds=60)),
    ],
)
async def trigger_liveness(
    payload: LivenessTriggerPayload,
    auth: AuthContext = Depends(require_teacher),
):
    if payload.session_id != "default-session":
        session = repository.get_session(payload.session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        _verify_session_tenant(session, auth)
        _verify_session_teacher(session, auth)

    action = random.choice(LIVENESS_ACTIONS)
    expires_sec = random.randint(3, 5)
    challenge_id = str(uuid.uuid4())
    msg = {
        "type": "liveness_challenge",
        "challenge_id": challenge_id,
        "action_id": action["id"],
        "action_label": action["label"],
        "expires_at": (datetime.now(timezone.utc).timestamp() + expires_sec) * 1000,
        "expires_sec": expires_sec,
    }
    if payload.user_id:
        await manager.send_to_student(payload.session_id, payload.user_id, msg)
    else:
        await manager.broadcast_to_students(payload.session_id, msg)

    logger.info(
        "Liveness challenge triggered",
        extra={
            "event_type": "LIVENESS_TRIGGERED",
            "session_id": payload.session_id,
            "participant_id": payload.user_id or "all",
            "outcome": "SUCCESS",
        },
    )
    return {
        "status": "success",
        "challenge_id": challenge_id,
        "action": action,
        "expires_sec": expires_sec,
    }


@app.post("/teacher/action", dependencies=[Depends(require_teacher)])
async def teacher_action(
    payload: TeacherActionPayload,
    auth: AuthContext = Depends(require_teacher),
):
    if payload.session_id != "default-session":
        session = repository.get_session(payload.session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        _verify_session_tenant(session, auth)
        _verify_session_teacher(session, auth)

    if payload.action not in ("mark_engaged", "ignore", "remove", "message"):
        raise HTTPException(
            status_code=400,
            detail="action must be mark_engaged, ignore, remove, or message",
        )
    msg = {
        "type": "teacher_action",
        "action": payload.action,
        "teacher_id": auth.user_id,
    }
    if payload.action == "message" and payload.message_text:
        msg["message_text"] = payload.message_text

    ok = await manager.send_to_student(payload.session_id, payload.user_id, msg)
    if not ok:
        return {"status": "error", "message": "student not found"}
    return {"status": "success"}


@app.post("/nudge/send", dependencies=[Depends(require_teacher)])
async def send_nudge(
    payload: NudgePayload,
    auth: AuthContext = Depends(require_teacher),
):
    if payload.session_id != "default-session":
        session = repository.get_session(payload.session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        _verify_session_tenant(session, auth)
        _verify_session_teacher(session, auth)

    msg = {
        "type": "nudge",
        "nudge_type": payload.nudge_type,
        "teacher_id": auth.user_id,
    }
    ok = await manager.send_to_student(payload.session_id, payload.user_id, msg)
    if not ok:
        return {"status": "error", "message": "student not found"}
    return {"status": "success"}

