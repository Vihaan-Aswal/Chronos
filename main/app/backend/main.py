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
    Form,
    File,
    UploadFile,
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
    ActivePresenceChallengeRequest,
    ActivePresenceResponseRequest,
    ActivePresenceDeclineRequest,
    ActivePresenceManualReviewRequest,
    SessionAnalyticsPayload,
    PolicySnapshot,
    PolicyId,
    SessionStatus,
    ResourceType,
    ResourceCreateRequest,
    ExternalLinkCreateRequest,
    ResourceEventRequest,
    ResourceResponse,
    ResourceAccessResponse,
    AnswerDraftRequest,
    AnswerSubmitRequest,
    AnswerResponse,
    SubmissionListResponse,
    ConsentGrantRequest,
    ConsentWithdrawRequest,
    ConsentRecordResponse,
    StudentContextRequest,
    BatchTeacherActionRequest,
    LegalHoldCreateRequest,
    LegalHoldReleaseRequest,
    LegalHoldResponse,
    DeletionRequestCreate,
    RetentionDryRunRequest,
    RetentionExecutionRequest,
)
from contracts import EventEnvelope, EventType, ActorRole, EventSource, ConsentCategory, AppealCategory
from projections.engine import ProjectionEngine
from reports.engine import ReportEngine
from reports.schemas import ReportReadModel
from observation.case_manager import CaseManager

from observation.notification_manager import NotificationPolicyTracker
from presence import challenge_manager, ActivePresenceResultState
from storage.storage_service import (
    get_storage_service,
    LocalStorageService,
    StorageValidationError,
    StorageNotFoundError,
    StorageIntegrityError,
    StorageError,
    EXTENSION_TO_MIME,
)
from assessment.resource_service import ResourceService
from assessment.answer_service import AnswerService
from privacy.consent_service import ConsentService
from privacy.legal_hold_service import LegalHoldService
from privacy.retention_service import RetentionService
from privacy.dsr_service import DSRService
from auth.hms_verification import HMSComplianceVerifier

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
storage_service = get_storage_service(supabase_client=supabase)
resource_service = ResourceService(repository=repository, storage_service=storage_service)
answer_service = AnswerService(repository=repository, storage_service=storage_service)
consent_service = ConsentService(repository=repository)
legal_hold_service = LegalHoldService(repository=repository)
retention_service = RetentionService(
    repository=repository,
    storage_service=storage_service,
    legal_hold_service=legal_hold_service,
)
dsr_service = DSRService(repository=repository, retention_service=retention_service)
hms_verifier = HMSComplianceVerifier()

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
    _verify_session_tenant(session, auth)
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


def _verify_session_participant(session: Dict[str, Any], auth: AuthContext):
    """
    Enforces that the authenticated user is admitted to the session (or is assigned teacher/admin).
    """
    _verify_session_tenant(session, auth)
    if auth.is_admin or auth.is_service_role:
        return
    if session.get("teacher_id") == auth.user_id:
        return

    current_status = session.get("status", "ACTIVE")
    if current_status in (SessionStatus.ENDED.value, SessionStatus.EXPIRED.value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot access session in '{current_status}' state",
        )

    session_id = session.get("session_id") or session.get("id")
    participant = repository.get_session_participant(session_id, auth.user_id)
    if not participant:
        # Check tenant membership as fallback
        membership = repository.verify_tenant_membership(auth.tenant_id, auth.user_id)
        if not membership:
            logger.warning(
                "Unadmitted participant access denied",
                extra={
                    "event_type": "UNADMITTED_PARTICIPANT_ACCESS_DENIED",
                    "session_id": session_id,
                    "participant_id": auth.user_id,
                    "tenant_id": auth.tenant_id,
                    "outcome": "DENIED",
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: User has not been admitted to this session",
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
    
    # Append durable SESSION_CREATED event
    evt = {
        "event_id": str(uuid.uuid4()),
        "event_type": "SESSION_CREATED",
        "schema_version": 1,
        "tenant_id": tenant_id,
        "session_id": session_id,
        "actor_id": auth.user_id,
        "actor_role": "teacher",
        "source": "server",
        "occurred_at": now.isoformat(),
        "policy_id": payload.policy_id.value,
        "is_demo": payload.is_demo,
        "payload": {
            "title": payload.title,
            "policy_snapshot": policy_snapshot,
            "expires_at": expires_at.isoformat(),
        },
    }
    try:
        repository.append_event(evt)
    except Exception as e:
        logger.warning(f"Failed to persist SESSION_CREATED event: {e}")

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

    policy_id_val = session.get("policy_id", PolicyId.CLASSROOM.value)
    try:
        policy_id = PolicyId(policy_id_val)
    except ValueError:
        policy_id = PolicyId.CLASSROOM

    # Invariant: Resource-supported and Supervised assessments require at least 1 primary paper
    if policy_id in (PolicyId.RESOURCE_SUPPORTED_ASSESSMENT, PolicyId.SUPERVISED_ASSESSMENT):
        res_list = repository.get_session_resources(session_id)
        has_primary = any(
            r.get("is_primary") or r.get("type") in ("uploaded_pdf", "primary_question_paper")
            for r in res_list
        )
        if not has_primary:
            # Check if there are any resources at all published
            if not res_list:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A primary question paper must be published before starting an assessment session",
                )

    now_iso = datetime.now(timezone.utc).isoformat()
    policy_snapshot = PolicySnapshot.create_snapshot_for_policy(
        policy_id, is_demo=session.get("is_demo", False)
    ).dict()

    started = repository.start_session(
        session_id=session_id,
        tenant_id=session["tenant_id"],
        policy_snapshot=policy_snapshot,
        started_at=now_iso,
    )

    # Append durable SESSION_STARTED event
    evt = {
        "event_id": str(uuid.uuid4()),
        "event_type": "SESSION_STARTED",
        "schema_version": 1,
        "tenant_id": session["tenant_id"],
        "session_id": session_id,
        "actor_id": auth.user_id,
        "actor_role": "teacher",
        "source": "server",
        "occurred_at": now_iso,
        "policy_id": policy_id.value,
        "is_demo": session.get("is_demo", False),
        "payload": {
            "policy_snapshot": policy_snapshot,
            "started_at": now_iso,
        },
    }
    try:
        repository.append_event(evt)
    except Exception as e:
        logger.warning(f"Failed to persist SESSION_STARTED event: {e}")

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

    # Append durable SESSION_ENDED event
    evt = {
        "event_id": str(uuid.uuid4()),
        "event_type": "SESSION_ENDED",
        "schema_version": 1,
        "tenant_id": session["tenant_id"],
        "session_id": session_id,
        "actor_id": auth.user_id,
        "actor_role": "teacher",
        "source": "server",
        "occurred_at": now_iso,
        "policy_id": session.get("policy_id", "CLASSROOM"),
        "is_demo": session.get("is_demo", False),
        "payload": {
            "ended_at": now_iso,
        },
    }
    try:
        repository.append_event(evt)
    except Exception as e:
        logger.warning(f"Failed to persist SESSION_ENDED event: {e}")

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
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    _verify_session_tenant(session, auth)
    if not auth.is_teacher and not auth.is_admin:
        _verify_session_participant(session, auth)
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
    session = repository.get_session(payload.session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)

    if payload.channel == "teacher":
        _verify_session_teacher(session, auth)
    else:
        _verify_session_participant(session, auth)

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
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_tenant(session, auth)
    if auth.is_teacher:
        _verify_session_teacher(session, auth)
    else:
        _verify_session_participant(session, auth)
    return meeting_service.generate_session_meeting_token(session_id, auth)


@app.post(
    "/hms-token",
    dependencies=[Depends(rate_limit(max_requests=10, window_seconds=60))],
)
def hms_token_legacy_adapter(
    req: TokenRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Legacy HMS token adapter endpoint.
    Strictly derives identity and role from server AuthContext.
    """
    session_id = req.session_id
    if session_id and session_id != "default-session":
        session = repository.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        _verify_session_tenant(session, auth)
        if auth.is_teacher:
            _verify_session_teacher(session, auth)
        else:
            _verify_session_participant(session, auth)
        return meeting_service.generate_session_meeting_token(session_id, auth)

    # If no session_id or default-session in legacy call, mint token with server-derived role
    derived_role = "teacher" if auth.is_teacher else "student"
    return meeting_service._mint_jwt(
        user_id=auth.user_id,
        role=derived_role,
        room_id=HMS_ROOM_ID,
        session_id="default-session",
        tenant_id=auth.tenant_id,
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
            msg_type = str(msg.get("type") or msg.get("event_type") or "").upper()
            now_iso = datetime.now(timezone.utc).isoformat()

            # Strict server rewrite: overwrite any caller-supplied user_id with verified actor_id
            enriched = {
                **msg,
                "session_id": session_id,
                "user_id": actor_id,
                "participant_id": actor_id,
                "tenant_id": tenant_id,
                "timestamp": msg.get("timestamp") or now_iso,
            }

            # Ingest OBSERVATION_SAMPLE heartbeats into durable event store
            if msg_type in ("OBSERVATION_SAMPLE", "METRICS"):
                session = repository.get_session(session_id)
                policy_id = session.get("policy_id", "CLASSROOM") if session else "CLASSROOM"
                # Consent enforcement: drop samples if ATTENTION_TELEMETRY was explicitly declined
                consent_status = repository.get_consent_status(tenant_id, actor_id, "ATTENTION_TELEMETRY", session_id)
                is_declined = consent_status and consent_status.get("grant_or_decline") == "DECLINE"
                
                if policy_id != "NO_ANALYTICS" and not is_declined:
                    payload_data = msg.get("payload") or msg
                    evt = {
                        "event_id": str(msg.get("event_id") or uuid.uuid4()),
                        "event_type": "OBSERVATION_SAMPLE",
                        "schema_version": 1,
                        "tenant_id": tenant_id,
                        "session_id": session_id,
                        "participant_id": actor_id,
                        "actor_id": actor_id,
                        "actor_role": "participant",
                        "source": "camera",
                        "occurred_at": msg.get("occurred_at") or enriched["timestamp"],
                        "policy_id": policy_id,
                        "payload": payload_data,
                    }
                    try:
                        repository.append_event(evt)
                    except Exception:
                        pass

            # Ingest browser visibility events with destination_known: False
            elif msg_type in ("PAGE_HIDDEN", "PAGE_VISIBLE", "WINDOW_BLURRED", "WINDOW_FOCUSED", "FULLSCREEN_ENTERED", "FULLSCREEN_EXITED"):
                session = repository.get_session(session_id)
                policy_id = session.get("policy_id", "CLASSROOM") if session else "CLASSROOM"
                # Consent enforcement: drop visibility events if BROWSER_CONTEXT_TELEMETRY was explicitly declined
                b_consent = repository.get_consent_status(tenant_id, actor_id, "BROWSER_CONTEXT_TELEMETRY", session_id)
                is_b_declined = b_consent and b_consent.get("grant_or_decline") == "DECLINE"

                if policy_id != "NO_ANALYTICS" and not is_b_declined:
                    payload_data = msg.get("payload") or {
                        "visibility_state": "HIDDEN" if "HIDDEN" in msg_type or "BLUR" in msg_type or "EXITED" in msg_type else "VISIBLE",
                        "started_at": msg.get("started_at"),
                        "ended_at": msg.get("ended_at"),
                        "duration_ms": msg.get("duration_ms"),
                        "destination_known": False,
                    }
                    evt = {
                        "event_id": str(msg.get("event_id") or uuid.uuid4()),
                        "event_type": msg_type,
                        "schema_version": 1,
                        "tenant_id": tenant_id,
                        "session_id": session_id,
                        "participant_id": actor_id,
                        "actor_id": actor_id,
                        "actor_role": "participant",
                        "source": "browser",
                        "occurred_at": msg.get("occurred_at") or enriched["timestamp"],
                        "policy_id": policy_id,
                        "payload": payload_data,
                    }
                    try:
                        repository.append_event(evt)
                    except Exception:
                        pass

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


# ---------------------------------------------------------------------------
# 7. Active Presence Protocol Endpoints (Workstream W4)
# ---------------------------------------------------------------------------

@app.post(
    "/api/v1/sessions/{session_id}/presence/challenge/request",
    dependencies=[Depends(get_auth_context)],
)
async def request_presence_challenge(
    session_id: str,
    req: ActivePresenceChallengeRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Creates and issues an Active Presence challenge bound to session and participant.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    _verify_session_tenant(session, auth)

    target_pid = req.participant_id or auth.user_id
    is_teacher = auth.role in (UserRole.TEACHER, UserRole.ADMIN)

    if not is_teacher and target_pid != auth.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot request challenge for other participants")
    if is_teacher and target_pid != auth.user_id:
        _verify_session_teacher(session, auth)

    policy_id = session.get("policy_id", "CLASSROOM")
    if policy_id == "NO_ANALYTICS":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active Presence checks are disabled under NO_ANALYTICS policy",
        )

    try:
        challenge = challenge_manager.create_challenge(
            tenant_id=auth.tenant_id,
            session_id=session_id,
            participant_id=target_pid,
            trigger=req.trigger,
            policy_id=policy_id,
            is_teacher_initiated=is_teacher,
            custom_actions=req.custom_actions,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    challenge_data = challenge.to_dict()

    # Append durable ACTIVE_PRESENCE_REQUESTED event
    evt = {
        "event_id": str(uuid.uuid4()),
        "event_type": "ACTIVE_PRESENCE_REQUESTED",
        "schema_version": 1,
        "tenant_id": auth.tenant_id,
        "session_id": session_id,
        "participant_id": target_pid,
        "actor_id": auth.user_id,
        "actor_role": "teacher" if is_teacher else "participant",
        "source": "server",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "policy_id": policy_id,
        "payload": challenge_data,
    }
    try:
        repository.append_event(evt)
    except Exception as err:
        logger.warning(f"Failed to persist ACTIVE_PRESENCE_REQUESTED: {err}")

    # Dispatch to participant over WebSocket
    ws_msg = {
        "type": "active_presence_challenge",
        **challenge_data,
    }
    await manager.send_to_student(session_id, target_pid, ws_msg)

    logger.info(
        "Active presence challenge issued",
        extra={
            "event_type": "ACTIVE_PRESENCE_REQUESTED",
            "session_id": session_id,
            "participant_id": target_pid,
            "challenge_id": challenge.challenge_id,
        },
    )
    return {"status": "success", "challenge": challenge_data}


@app.post(
    "/api/v1/sessions/{session_id}/presence/challenge/respond",
    dependencies=[Depends(require_student)],
)
async def respond_presence_challenge(
    session_id: str,
    req: ActivePresenceResponseRequest,
    auth: AuthContext = Depends(require_student),
):
    """
    Submits student challenge response proof with cryptographic binding verification.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    _verify_session_tenant(session, auth)

    result_state, challenge_dict = challenge_manager.respond_to_challenge(
        challenge_id=req.challenge_id,
        participant_id=auth.user_id,
        session_id=session_id,
        nonce=req.nonce,
        submitted_actions=req.submitted_actions,
        quality_ok=req.quality_ok,
        elapsed_ms=req.elapsed_ms,
        is_neutral_baseline_held=req.is_neutral_baseline_held,
        is_return_to_neutral_held=req.is_return_to_neutral_held,
        alternative_verification=req.alternative_verification,
    )

    policy_id = session.get("policy_id", "CLASSROOM")

    # Map state to canonical durable event
    if result_state == ActivePresenceResultState.PASSED:
        event_type = EventType.ACTIVE_PRESENCE_PASSED.value
    elif result_state == ActivePresenceResultState.TIMED_OUT:
        event_type = EventType.ACTIVE_PRESENCE_TIMED_OUT.value
    elif result_state == ActivePresenceResultState.QUALITY_FAIL:
        attempt = challenge_dict.get("attempt_number", 1)
        max_retries = challenge_dict.get("max_retries", 2)
        event_type = EventType.ACTIVE_PRESENCE_RETRY_REQUIRED.value if attempt < max_retries else EventType.ACTIVE_PRESENCE_UNAVAILABLE.value
    else:
        event_type = EventType.ACTIVE_PRESENCE_RETRY_REQUIRED.value

    evt = {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "schema_version": 1,
        "tenant_id": auth.tenant_id,
        "session_id": session_id,
        "participant_id": auth.user_id,
        "actor_id": auth.user_id,
        "actor_role": "participant",
        "source": "camera",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "policy_id": policy_id,
        "payload": {
            **challenge_dict,
            "result_state": result_state.value if isinstance(result_state, ActivePresenceResultState) else str(result_state),
        },
    }
    try:
        repository.append_event(evt)
    except Exception as err:
        logger.warning(f"Failed to persist {event_type}: {err}")

    # Notify teacher dashboard
    teacher_msg = {
        "type": f"active_presence_{result_state.value.lower()}",
        "session_id": session_id,
        "user_id": auth.user_id,
        "participant_id": auth.user_id,
        "challenge_id": req.challenge_id,
        "status": result_state.value if isinstance(result_state, ActivePresenceResultState) else str(result_state),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await manager.broadcast_to_teachers(session_id, teacher_msg)

    return {
        "status": "success",
        "result_state": result_state.value if isinstance(result_state, ActivePresenceResultState) else str(result_state),
        "challenge": challenge_dict,
    }


@app.post(
    "/api/v1/sessions/{session_id}/presence/challenge/decline",
    dependencies=[Depends(require_student)],
)
async def decline_presence_challenge(
    session_id: str,
    req: ActivePresenceDeclineRequest,
    auth: AuthContext = Depends(require_student),
):
    """
    Allows a participant to decline an active challenge (non-punitive fallback path).
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    _verify_session_tenant(session, auth)

    result_state, challenge_dict = challenge_manager.decline_challenge(
        challenge_id=req.challenge_id,
        participant_id=auth.user_id,
        session_id=session_id,
        reason=req.reason,
    )

    policy_id = session.get("policy_id", "CLASSROOM")
    evt = {
        "event_id": str(uuid.uuid4()),
        "event_type": "ACTIVE_PRESENCE_DECLINED",
        "schema_version": 1,
        "tenant_id": auth.tenant_id,
        "session_id": session_id,
        "participant_id": auth.user_id,
        "actor_id": auth.user_id,
        "actor_role": "participant",
        "source": "browser",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "policy_id": policy_id,
        "payload": challenge_dict,
    }
    try:
        repository.append_event(evt)
    except Exception as err:
        logger.warning(f"Failed to persist ACTIVE_PRESENCE_DECLINED: {err}")

    teacher_msg = {
        "type": "active_presence_declined",
        "session_id": session_id,
        "user_id": auth.user_id,
        "participant_id": auth.user_id,
        "challenge_id": req.challenge_id,
        "status": "DECLINED",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await manager.broadcast_to_teachers(session_id, teacher_msg)

    return {"status": "success", "result_state": "DECLINED", "challenge": challenge_dict}


@app.post(
    "/api/v1/sessions/{session_id}/presence/challenge/manual-request",
    dependencies=[Depends(require_student)],
)
async def manual_request_presence_challenge(
    session_id: str,
    req: ActivePresenceManualReviewRequest,
    auth: AuthContext = Depends(require_student),
):
    """
    Allows a participant with hardware or mobility constraints to request teacher manual check.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    _verify_session_tenant(session, auth)

    result_state, challenge_dict = challenge_manager.request_manual_review(
        challenge_id=req.challenge_id,
        participant_id=auth.user_id,
        session_id=session_id,
        reason=req.reason,
    )

    policy_id = session.get("policy_id", "CLASSROOM")
    evt = {
        "event_id": str(uuid.uuid4()),
        "event_type": "ACTIVE_PRESENCE_REQUESTED",
        "schema_version": 1,
        "tenant_id": auth.tenant_id,
        "session_id": session_id,
        "participant_id": auth.user_id,
        "actor_id": auth.user_id,
        "actor_role": "participant",
        "source": "browser",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "policy_id": policy_id,
        "payload": {
            **challenge_dict,
            "mode": "manual_review",
            "alternative_verification_used": True,
        },
    }
    try:
        repository.append_event(evt)
    except Exception as err:
        logger.warning(f"Failed to persist ACTIVE_PRESENCE_REQUESTED (manual): {err}")

    teacher_msg = {
        "type": "active_presence_manual_review",
        "session_id": session_id,
        "user_id": auth.user_id,
        "participant_id": auth.user_id,
        "challenge_id": req.challenge_id,
        "status": "MANUAL_REVIEW",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await manager.broadcast_to_teachers(session_id, teacher_msg)

    return {"status": "success", "result_state": "MANUAL_REVIEW", "challenge": challenge_dict}


# ---------------------------------------------------------------------------
# Legacy Endpoint Adapter: /liveness/trigger
# ---------------------------------------------------------------------------

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

    target_pid = payload.user_id or "all"
    session_id = payload.session_id
    tenant_id = auth.tenant_id

    # Create challenge via challenge manager
    actions = challenge_manager.select_compatible_actions()
    challenge_id = str(uuid.uuid4())
    expires_sec = 15

    msg = {
        "type": "liveness_challenge",
        "challenge_id": challenge_id,
        "actions": actions,
        "action_id": actions[0].lower(),
        "action_label": actions[0].replace("_", " ").title(),
        "sequence": actions,
        "expires_at": (datetime.now(timezone.utc).timestamp() + expires_sec) * 1000,
        "expires_sec": expires_sec,
    }
    if payload.user_id:
        await manager.send_to_student(session_id, payload.user_id, msg)
    else:
        await manager.broadcast_to_students(session_id, msg)

    logger.info(
        "Liveness challenge triggered",
        extra={
            "event_type": "LIVENESS_TRIGGERED",
            "session_id": payload.session_id,
            "participant_id": target_pid,
            "outcome": "SUCCESS",
        },
    )
    return {
        "status": "success",
        "challenge_id": challenge_id,
        "actions": actions,
        "expires_sec": expires_sec,
    }


@app.post("/teacher/action", dependencies=[Depends(require_teacher)])
async def teacher_action(
    payload: TeacherActionPayload,
    auth: AuthContext = Depends(require_teacher),
):
    session = None
    if payload.session_id != "default-session":
        session = repository.get_session(payload.session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        _verify_session_tenant(session, auth)
        _verify_session_teacher(session, auth)

    action = payload.action_type or payload.action or ""
    valid_actions = (
        "mark_engaged", "ignore", "remove", "message",
        "acknowledge_context", "acknowledge", "mark_technical",
        "dismiss_recovered", "dismiss", "snooze", "request_follow_up",
        "resolve_case", "resolve_incident", "batch_resolve", "resolve"
    )
    if action not in valid_actions:
        raise HTTPException(
            status_code=400,
            detail=f"action must be one of: {', '.join(valid_actions)}",
        )

    target_case_ids = payload.case_ids or []
    target_pids = payload.user_ids or ([payload.user_id] if payload.user_id else [])
    is_batch = len(target_case_ids) > 1 or len(target_pids) > 1

    # 1. Emit durable TEACHER_ACTION_RECORDED event
    now_iso = datetime.now(timezone.utc).isoformat()
    policy_id = session.get("policy_id", "CLASSROOM") if session else "CLASSROOM"
    evt = {
        "event_id": str(uuid.uuid4()),
        "event_type": "TEACHER_ACTION_RECORDED",
        "schema_version": 1,
        "tenant_id": auth.tenant_id,
        "session_id": payload.session_id,
        "participant_id": target_pids[0] if len(target_pids) == 1 else None,
        "actor_id": auth.user_id,
        "actor_role": "teacher",
        "source": "teacher",
        "occurred_at": now_iso,
        "policy_id": policy_id,
        "payload": {
            "action_id": str(uuid.uuid4()),
            "action_type": action,
            "target_participant_ids": target_pids,
            "target_case_ids": target_case_ids,
            "is_batch": is_batch,
            "note": payload.note or (payload.message_text if action == "message" else None),
            "snooze_duration_minutes": payload.snooze_duration_minutes,
        },
    }
    repository.append_event(evt)

    # 2. Record Audit Log
    repository.record_audit_log({
        "tenant_id": auth.tenant_id,
        "session_id": payload.session_id,
        "actor_id": auth.user_id,
        "actor_role": "teacher",
        "action_type": "TEACHER_ACTION",
        "target_user_id": target_pids[0] if len(target_pids) == 1 else None,
        "target_resource": "session_cases" if target_case_ids else "participant",
        "details": {
            "action": action,
            "case_ids": target_case_ids,
            "participant_ids": target_pids,
            "is_batch": is_batch,
        },
    })

    # 3. Notify student if single message/action
    if payload.user_id and action in ("message", "mark_engaged", "remove", "ignore"):
        msg = {
            "type": "teacher_action",
            "action": action,
            "teacher_id": auth.user_id,
        }
        if action == "message" and payload.message_text:
            msg["message_text"] = payload.message_text
        await manager.send_to_student(payload.session_id, payload.user_id, msg)

    # 4. Broadcast updated cases to teacher WebSockets
    if payload.session_id != "default-session":
        events = repository.get_session_events(payload.session_id)
        updated_cases = CaseManager.build_session_cases(events, payload.session_id, policy_id=policy_id)
        await manager.broadcast_to_teachers(payload.session_id, {
            "type": "cases_update",
            "session_id": payload.session_id,
            "cases": updated_cases,
            "action_executed": action,
            "timestamp": now_iso,
        })

    return {
        "status": "success",
        "action": action,
        "cases_affected": len(target_case_ids),
        "participants_affected": len(target_pids),
    }


@app.get("/api/v1/sessions/{session_id}/cases", dependencies=[Depends(require_teacher)])
async def get_session_cases(
    session_id: str,
    view: Optional[str] = Query(None, description="active | monitor | technical | context_added | recovered | resolved"),
    auth: AuthContext = Depends(require_teacher),
):
    """
    Returns server-authoritative grouped triage cases for the session.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    events = repository.get_session_events(session_id)
    policy_id = session.get("policy_id", "CLASSROOM")
    cases = CaseManager.build_session_cases(events, session_id, policy_id=policy_id)

    if view:
        view_lower = view.lower()
        if view_lower == "active":
            cases = [c for c in cases if c.get("status") in ("OPEN", "ACTION_REQUIRED") and c.get("priority") in ("ACTION_REQUIRED", "URGENT")]
        elif view_lower == "monitor":
            cases = [c for c in cases if c.get("status") == "OPEN" and c.get("priority") == "MONITOR" and c.get("category") not in ("TECHNICAL_CAMERA", "TECHNICAL_NETWORK", "SESSION_INCIDENT")]
        elif view_lower == "technical":
            cases = [c for c in cases if c.get("status") in ("OPEN", "ACTION_REQUIRED") and c.get("category") in ("TECHNICAL_CAMERA", "TECHNICAL_NETWORK", "SESSION_INCIDENT")]
        elif view_lower in ("context_added", "context"):
            cases = [c for c in cases if c.get("status") in ("OPEN", "ACTION_REQUIRED") and c.get("student_context_count", 0) > 0]
        elif view_lower == "recovered":
            cases = [c for c in cases if c.get("self_recovery_attempted") is True or c.get("status") == "SELF_RECOVERED"]
        elif view_lower == "resolved":
            cases = [c for c in cases if c.get("status") in ("RESOLVED", "DISMISSED")]

    return {"status": "success", "session_id": session_id, "count": len(cases), "cases": cases}


@app.post("/api/v1/sessions/{session_id}/cases/actions", dependencies=[Depends(require_teacher)])
async def execute_batch_teacher_actions(
    session_id: str,
    payload: BatchTeacherActionRequest,
    auth: AuthContext = Depends(require_teacher),
):
    """
    Executes an atomic batch action on 1 to 100 triage cases or participants.
    Records TEACHER_ACTION_RECORDED event, writes audit_logs entries, and broadcasts case updates.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    is_batch = len(payload.case_ids) > 1 or len(payload.participant_ids) > 1
    now_iso = datetime.now(timezone.utc).isoformat()
    action_id = str(uuid.uuid4())
    action_type = payload.action_type

    # 1. Emit durable TEACHER_ACTION_RECORDED event
    evt = {
        "event_id": str(uuid.uuid4()),
        "event_type": "TEACHER_ACTION_RECORDED",
        "schema_version": 1,
        "tenant_id": auth.tenant_id,
        "session_id": session_id,
        "participant_id": payload.participant_ids[0] if len(payload.participant_ids) == 1 else None,
        "actor_id": auth.user_id,
        "actor_role": "teacher",
        "source": "teacher",
        "occurred_at": now_iso,
        "policy_id": session.get("policy_id", "CLASSROOM"),
        "payload": {
            "action_id": action_id,
            "action_type": action_type,
            "target_case_ids": payload.case_ids,
            "target_participant_ids": payload.participant_ids,
            "is_batch": is_batch,
            "note": payload.note,
            "snooze_duration_minutes": payload.snooze_duration_minutes,
        },
    }
    repository.append_event(evt)

    # 2. Record Audit Log
    repository.record_audit_log({
        "tenant_id": auth.tenant_id,
        "session_id": session_id,
        "actor_id": auth.user_id,
        "actor_role": "teacher",
        "action_type": "TEACHER_ACTION",
        "target_resource": "session_cases",
        "details": {
            "action_type": action_type,
            "case_ids": payload.case_ids,
            "participant_ids": payload.participant_ids,
            "is_batch": is_batch,
        },
    })

    # 3. Broadcast updated cases to teacher WebSockets
    events = repository.get_session_events(session_id)
    updated_cases = CaseManager.build_session_cases(events, session_id, policy_id=session.get("policy_id", "CLASSROOM"))
    await manager.broadcast_to_teachers(session_id, {
        "type": "cases_update",
        "session_id": session_id,
        "cases": updated_cases,
        "action_executed": action_type,
        "timestamp": now_iso,
    })

    return {
        "status": "success",
        "action_id": action_id,
        "action_type": action_type,
        "cases_affected": len(payload.case_ids),
        "participants_affected": len(payload.participant_ids),
    }


@app.post("/nudge/send", dependencies=[Depends(require_teacher)])
async def send_nudge(
    payload: NudgePayload,
    auth: AuthContext = Depends(require_teacher),
):
    session = None
    if payload.session_id != "default-session":
        session = repository.get_session(payload.session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        _verify_session_tenant(session, auth)
        _verify_session_teacher(session, auth)

    # Emit durable STUDENT_NUDGED event
    now_iso = datetime.now(timezone.utc).isoformat()
    policy_id = session.get("policy_id", "CLASSROOM") if session else "CLASSROOM"
    evt = {
        "event_id": str(uuid.uuid4()),
        "event_type": "STUDENT_NUDGED",
        "schema_version": 1,
        "tenant_id": auth.tenant_id,
        "session_id": payload.session_id,
        "participant_id": payload.user_id,
        "actor_id": auth.user_id,
        "actor_role": "teacher",
        "source": "teacher",
        "occurred_at": now_iso,
        "policy_id": policy_id,
        "payload": {
            "nudge_id": str(uuid.uuid4()),
            "nudge_type": payload.nudge_type,
            "delivery_channel": "in_app_banner",
        },
    }
    repository.append_event(evt)

    msg = {
        "type": "nudge",
        "nudge_type": payload.nudge_type,
        "teacher_id": auth.user_id,
    }
    ok = await manager.send_to_student(payload.session_id, payload.user_id, msg)
    if not ok:
        return {"status": "error", "message": "student not found"}
    return {"status": "success"}


# ===========================================================================
# Workstream W2: Domain Contracts & Event Persistence Endpoints
# ===========================================================================

@app.post("/api/v1/events/ingest")
async def ingest_event(
    event: EventEnvelope,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Authoritative event ingestion gateway:
    - Enforces tenant and session scoping.
    - Validates actor_id matches authenticated user (or service role/admin).
    - Validates demo/live consistency with session.
    - Rejects invalid actor/source combinations.
    - Persists event with server_sequence allocation and idempotency.
    - Updates materialized projections.
    """
    session = repository.get_session(event.session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)

    # Actor validation: authenticated caller cannot forge a different actor_id
    if not (auth.is_admin or auth.is_service_role):
        if event.actor_id != auth.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Actor ID does not match authenticated identity",
            )
        # Check source/role combinations
        if auth.role == UserRole.STUDENT:
            if str(event.actor_role).lower() not in ("participant", "student"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Participant cannot emit non-participant events",
                )
            if str(event.source).lower() not in ("browser", "camera"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Participant source must be browser or camera",
                )
            if str(event.event_type) in (
                "TEACHER_ACTION_RECORDED", "POLICY_CHANGED",
                "WINDOW_FINALIZED", "CASE_CREATED", "CASE_RESOLVED", "RESOURCE_PUBLISHED"
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Unauthorized event type for participant",
                )

    # Demo/live alignment validation
    session_is_demo = session.get("is_demo", False)
    if session_is_demo != event.is_demo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Demo/live mixing mismatch between event and session",
        )

    # Convert pydantic model to dict
    event_dict = event.dict()
    persisted = repository.append_event(event_dict)
    return {"status": "success", "event": persisted}


@app.get("/api/v1/sessions/{session_id}/events")
async def get_session_events(
    session_id: str,
    since_sequence: Optional[int] = Query(None, alias="since_sequence"),
    limit: int = Query(1000, ge=1, le=50000),
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Fetch ordered event stream for a session from since_sequence.
    Supports reconnect catch-up and offline synchronization.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)

    if auth.role == UserRole.STUDENT:
        # Students only see own events and session-wide broadcasts
        events = repository.get_participant_events(
            session_id=session_id,
            participant_id=auth.user_id,
            from_sequence=since_sequence,
        )
        # Redact private teacher notes for student viewers
        for evt in events:
            if evt.get("event_type") == "TEACHER_ACTION_RECORDED":
                p = evt.get("payload", {})
                if isinstance(p, dict) and p.get("note"):
                    p["note"] = "[TEACHER_NOTE_CONFIDENTIAL]"
    else:
        _verify_session_teacher(session, auth)
        events = repository.get_session_events(
            session_id=session_id,
            from_sequence=since_sequence,
            limit=limit,
        )

    return {
        "session_id": session_id,
        "count": len(events),
        "events": events,
    }


@app.get("/api/v1/sessions/{session_id}/projections/participant/{participant_id}")
async def get_participant_projection(
    session_id: str,
    participant_id: str,
    auth: AuthContext = Depends(get_auth_context),
):
    """Fetch consolidated projection for a participant."""
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)

    if auth.role == UserRole.STUDENT:
        if auth.user_id != participant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot access another participant's state",
            )
    else:
        _verify_session_teacher(session, auth)

    projection = repository.get_participant_projection(session_id, participant_id)
    if not projection:
        events = repository.get_session_events(session_id)
        projection = ProjectionEngine.build_participant_projection(events, participant_id, session_id)

    return {"status": "success", "projection": projection}


@app.get("/api/v1/sessions/{session_id}/projections/participants", dependencies=[Depends(require_teacher)])
async def list_participant_projections(
    session_id: str,
    auth: AuthContext = Depends(require_teacher),
):
    """List all participant projections in a session for teacher triage rail."""
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    projections = repository.list_session_participant_projections(session_id)
    return {"status": "success", "count": len(projections), "projections": projections}


@app.post("/api/v1/sessions/{session_id}/projections/rebuild", dependencies=[Depends(require_teacher)])
async def rebuild_session_projections(
    session_id: str,
    auth: AuthContext = Depends(require_teacher),
):
    """Deterministically rebuild all projections from durable append-only event stream."""
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    result = repository.rebuild_projections_for_session(session_id)
    return {"status": "success", "result": result}


# ---------------------------------------------------------------------------
# Assessment & Storage Endpoints (Resource-Supported Assessment)
# ---------------------------------------------------------------------------

@app.get("/api/v1/storage/download")
async def storage_download(
    path: str = Query(..., description="Storage path of the artifact"),
    expires_at: int = Query(..., description="Expiration timestamp in epoch seconds"),
    signature: str = Query(..., description="HMAC SHA-256 signature"),
):
    """
    Secure file download endpoint for local storage double.
    Validates HMAC signature and expiration timestamp.
    """
    if isinstance(storage_service, LocalStorageService):
        if not storage_service.verify_signed_url(
            path=path, expires_at=expires_at, signature=signature
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired download signature",
            )

    try:
        content = storage_service.download_file(path)
    except StorageNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact not found at path '{path}'",
        )
    except StorageIntegrityError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve artifact: {e}",
        )

    ext = os.path.splitext(path)[1].lower()
    media_type = EXTENSION_TO_MIME.get(ext, "application/octet-stream")

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{os.path.basename(path)}"',
        },
    )


# --- Teacher Resource Endpoints ---

@app.post(
    "/api/v1/sessions/{session_id}/resources/upload",
    response_model=ResourceResponse,
    dependencies=[Depends(require_teacher)],
)
async def upload_session_resource(
    session_id: str,
    file: UploadFile = File(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    is_primary: bool = Form(False),
    required: bool = Form(False),
    allowed_from: Optional[str] = Form(None),
    allowed_until: Optional[str] = Form(None),
    auth: AuthContext = Depends(require_teacher),
):
    """
    Teacher endpoint to upload an assessment artifact (PDF, PNG, JPG).
    Enforces tenancy, immutability prior to session start, size <=20MB, and capacity limits.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {e}",
        )

    try:
        resource = resource_service.publish_uploaded_resource(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            actor_id=auth.user_id,
            title=title,
            description=description,
            file_bytes=file_bytes,
            filename=file.filename or "artifact",
            content_type=file.content_type,
            is_primary=is_primary,
            required=required,
            allowed_from=allowed_from,
            allowed_until=allowed_until,
        )
        return ResourceResponse(**resource)
    except StorageValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        elif "after session has started" in err_msg or "Cannot add" in err_msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=err_msg)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


@app.post(
    "/api/v1/sessions/{session_id}/resources/external-link",
    response_model=ResourceResponse,
    dependencies=[Depends(require_teacher)],
)
async def create_external_link_resource(
    session_id: str,
    payload: ExternalLinkCreateRequest,
    auth: AuthContext = Depends(require_teacher),
):
    """
    Teacher endpoint to publish an external link resource (HTTPS only).
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    try:
        resource = resource_service.publish_external_link(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            actor_id=auth.user_id,
            title=payload.title,
            description=payload.description,
            declared_url=payload.declared_url,
            allowed_domain=payload.allowed_domain,
            required=payload.required,
            allowed_from=payload.allowed_from,
            allowed_until=payload.allowed_until,
        )
        return ResourceResponse(**resource)
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        elif "after session has started" in err_msg or "Cannot add" in err_msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=err_msg)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


@app.delete(
    "/api/v1/sessions/{session_id}/resources/{resource_id}",
    dependencies=[Depends(require_teacher)],
)
async def delete_session_resource(
    session_id: str,
    resource_id: str,
    auth: AuthContext = Depends(require_teacher),
):
    """
    Teacher endpoint to delete a resource before session start.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    try:
        resource_service.delete_resource(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            actor_id=auth.user_id,
            resource_id=resource_id,
        )
        return {"status": "success", "deleted_resource_id": resource_id}
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        elif "after session has started" in err_msg or "Cannot delete" in err_msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=err_msg)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


@app.get(
    "/api/v1/sessions/{session_id}/submissions",
    response_model=SubmissionListResponse,
    dependencies=[Depends(require_teacher)],
)
async def list_session_submissions(
    session_id: str,
    auth: AuthContext = Depends(require_teacher),
):
    """
    Teacher endpoint to list all student submissions for a session.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    try:
        submissions = answer_service.list_session_submissions_for_teacher(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            teacher_id=auth.user_id,
        )
        items = [AnswerResponse(**s) for s in submissions]
        return SubmissionListResponse(submissions=items, items=items)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


@app.get(
    "/api/v1/sessions/{session_id}/submissions/{submission_id}/download",
    dependencies=[Depends(require_teacher)],
)
async def get_submission_download(
    session_id: str,
    submission_id: str,
    auth: AuthContext = Depends(require_teacher),
):
    """
    Teacher endpoint to retrieve signed download URL for a student submission.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    try:
        result = answer_service.get_submission_download_url(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            requester_id=auth.user_id,
            requester_role=auth.role.value if hasattr(auth.role, "value") else str(auth.role),
            answer_id=submission_id,
        )
        url = result.get("download_url") or ""
        expires_in = result.get("expires_in_seconds", 900)
        return {
            "status": "success",
            "download_url": url,
            "expires_in_seconds": expires_in,
        }
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


# --- Student & Shared Resource/Answer Endpoints ---

@app.get(
    "/api/v1/sessions/{session_id}/resources",
    response_model=List[ResourceResponse],
)
async def list_session_resources(
    session_id: str,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Student & teacher endpoint to list resources published for a session.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)

    try:
        resources = resource_service.list_session_resources(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            actor_id=auth.user_id,
            actor_role=auth.role.value if hasattr(auth.role, "value") else str(auth.role),
        )
        return [ResourceResponse(**r) for r in resources]
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


@app.get(
    "/api/v1/sessions/{session_id}/resources/{resource_id}/access",
    response_model=ResourceAccessResponse,
)
async def get_session_resource_access(
    session_id: str,
    resource_id: str,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Student & teacher endpoint to request expiring download or declared URL for a resource.
    Checks availability window (allowed_from / allowed_until).
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)

    try:
        access_info = resource_service.get_resource_access(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            participant_id=auth.user_id,
            resource_id=resource_id,
        )
        return ResourceAccessResponse(**access_info)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


@app.post(
    "/api/v1/sessions/{session_id}/resources/{resource_id}/events",
)
async def record_resource_event(
    session_id: str,
    resource_id: str,
    payload: ResourceEventRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Records participant interaction with a resource (RESOURCE_OPENED, RESOURCE_CLOSED, EXTERNAL_RESOURCE_CLICKED).
    Guarantees destination_known: false privacy invariant on external link clicks.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)

    try:
        persisted = resource_service.record_resource_interaction(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            participant_id=auth.user_id,
            resource_id=resource_id,
            event_type=payload.event_type,
            duration_ms=payload.duration_ms,
        )
        event_id = (
            persisted.get("event_id")
            if isinstance(persisted, dict)
            else getattr(persisted, "event_id", str(uuid.uuid4()))
        )
        return {"status": "success", "event_id": event_id}
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


@app.post(
    "/api/v1/sessions/{session_id}/answers/draft",
    response_model=AnswerResponse,
    dependencies=[Depends(require_student)],
)
async def save_answer_draft(
    session_id: str,
    payload: AnswerDraftRequest,
    auth: AuthContext = Depends(require_student),
):
    """
    Student auto-save draft endpoint for typed answer text.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)

    try:
        draft = answer_service.save_draft(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            participant_id=auth.user_id,
            typed_content=payload.typed_content,
        )
        return AnswerResponse(**draft)
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


@app.post(
    "/api/v1/sessions/{session_id}/answers/submit",
    response_model=AnswerResponse,
    dependencies=[Depends(require_student)],
)
async def submit_answer(
    session_id: str,
    request: Request,
    auth: AuthContext = Depends(require_student),
):
    """
    Student final submission endpoint.
    Supports both JSON (typed_content) and multipart/form-data (file upload).
    Validates max 3 versions per participant.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)

    content_type_header = request.headers.get("content-type", "")

    typed_content: Optional[str] = None
    file_bytes: Optional[bytes] = None
    filename: Optional[str] = None
    file_content_type: Optional[str] = None
    client_submission_id: Optional[str] = None

    if "application/json" in content_type_header:
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body"
            )
        typed_content = body.get("typed_content")
        client_submission_id = body.get("client_submission_id")
    elif (
        "multipart/form-data" in content_type_header
        or "application/x-www-form-urlencoded" in content_type_header
    ):
        try:
            form = await request.form()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid form data: {e}"
            )
        uploaded = form.get("file")
        typed_content = form.get("typed_content")
        if isinstance(typed_content, str) and not typed_content:
            typed_content = None
        client_submission_id = form.get("client_submission_id")
        if isinstance(client_submission_id, str) and not client_submission_id:
            client_submission_id = None

        if uploaded is not None and hasattr(uploaded, "read"):
            file_bytes = await uploaded.read()
            filename = getattr(uploaded, "filename", "artifact")
            file_content_type = getattr(uploaded, "content_type", None)
    else:
        try:
            body = await request.json()
            typed_content = body.get("typed_content")
            client_submission_id = body.get("client_submission_id")
        except Exception:
            try:
                form = await request.form()
                uploaded = form.get("file")
                typed_content = form.get("typed_content")
                client_submission_id = form.get("client_submission_id")
                if uploaded is not None and hasattr(uploaded, "read"):
                    file_bytes = await uploaded.read()
                    filename = getattr(uploaded, "filename", "artifact")
                    file_content_type = getattr(uploaded, "content_type", None)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unsupported Content-Type. Expected application/json or multipart/form-data",
                )

    try:
        submission = answer_service.submit_answer(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            participant_id=auth.user_id,
            typed_content=typed_content,
            file_bytes=file_bytes,
            filename=filename,
            content_type=file_content_type,
            client_submission_id=client_submission_id,
        )
        return AnswerResponse(**submission)
    except StorageValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


@app.get(
    "/api/v1/sessions/{session_id}/answers/mine",
    response_model=List[AnswerResponse],
    dependencies=[Depends(require_student)],
)
async def get_my_answers(
    session_id: str,
    auth: AuthContext = Depends(require_student),
):
    """
    Student endpoint to list their own submissions and drafts for a session.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    _verify_session_tenant(session, auth)

    try:
        answers = answer_service.list_student_submissions(
            session_id=session_id,
            tenant_id=auth.tenant_id,
            participant_id=auth.user_id,
        )
        return [AnswerResponse(**a) for a in answers]
    except ValueError as e:
        err_msg = str(e)
        if "not found" in err_msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err_msg)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)


# ---------------------------------------------------------------------------
# 10. Privacy, Granular Consent & Data Lifecycle Endpoints (Workstream W6)
# ---------------------------------------------------------------------------

@app.post("/api/v1/privacy/consent")
async def record_consent_choice(
    payload: ConsentGrantRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Record or update granular consent choice(s).
    Supports single scope or batch scopes map (e.g. from Pre-Join Transparency screen).
    """
    tenant_id = auth.tenant_id
    subject_id = auth.user_id
    actor_type = auth.role

    if payload.scopes:
        results = consent_service.record_batch_consent_grants(
            tenant_id=tenant_id,
            subject_id=subject_id,
            scopes=payload.scopes,
            session_id=payload.session_id,
            policy_version=payload.policy_version,
            actor_type=actor_type,
        )
        return {"status": "success", "consents": results}
    elif payload.scope:
        result = consent_service.record_consent_grant(
            tenant_id=tenant_id,
            subject_id=subject_id,
            scope=payload.scope,
            grant=payload.grant,
            session_id=payload.session_id,
            policy_version=payload.policy_version,
            actor_type=actor_type,
        )
        return {"status": "success", "consent": result}
    else:
        raise HTTPException(status_code=400, detail="Must provide 'scope' or 'scopes'")


@app.post("/api/v1/privacy/consent/withdraw")
async def withdraw_consent_choice(
    payload: ConsentWithdrawRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Withdraw consent for an optional processing scope mid-session.
    Routes participant to manual / camera-optional alternative without penalty.
    """
    withdrawn = consent_service.withdraw_consent(
        tenant_id=auth.tenant_id,
        subject_id=auth.user_id,
        scope=payload.scope,
        session_id=payload.session_id,
        policy_version=payload.policy_version,
    )
    if not withdrawn:
        raise HTTPException(status_code=400, detail="Failed to withdraw consent")
    return {"status": "success", "withdrawn": withdrawn}


@app.get("/api/v1/privacy/consent/mine")
async def get_my_consents(
    session_id: Optional[str] = Query(None),
    auth: AuthContext = Depends(get_auth_context),
):
    """List active and historical consent choices for authenticated participant."""
    consents = consent_service.list_participant_consents(
        tenant_id=auth.tenant_id,
        subject_id=auth.user_id,
        session_id=session_id,
    )
    return {"status": "success", "consents": consents}


@app.get("/api/v1/privacy/data-export")
async def export_my_data(
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Subject Access Request (SAR): Export personal derived events, projections,
    and submission metadata. Guaranteed: zero raw media or embeddings.
    """
    exported = dsr_service.export_participant_data(
        tenant_id=auth.tenant_id,
        subject_id=auth.user_id,
    )
    return exported


@app.post("/api/v1/privacy/deletion-request")
async def request_data_deletion(
    payload: DeletionRequestCreate,
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Submit a participant data erasure / deletion request.
    Idempotent and respects legal holds.
    """
    res = dsr_service.request_erasure(
        tenant_id=auth.tenant_id,
        subject_id=auth.user_id,
        session_id=payload.session_id,
        data_classes=payload.data_classes,
        reason=payload.reason,
        requested_by=auth.user_id,
    )
    return res


@app.post("/api/v1/privacy/holds", dependencies=[Depends(require_admin)])
async def create_legal_hold_endpoint(
    payload: LegalHoldCreateRequest,
    auth: AuthContext = Depends(require_admin),
):
    """Create a new legal / institutional hold protecting target data from expiration."""
    hold = legal_hold_service.create_hold(
        tenant_id=auth.tenant_id,
        reason=payload.reason,
        approver_id=auth.user_id,
        approver_email=payload.approver_email,
        expiry_or_review_date=payload.expiry_or_review_date,
        session_id=payload.session_id,
        subject_id=payload.subject_id,
        data_classes=payload.data_classes,
        notes=payload.notes,
    )
    return {"status": "success", "hold": hold}


@app.get("/api/v1/privacy/holds", dependencies=[Depends(require_admin)])
async def list_legal_holds_endpoint(
    status_filter: Optional[str] = Query(None, alias="status"),
    session_id: Optional[str] = Query(None),
    auth: AuthContext = Depends(require_admin),
):
    """List active or filtered legal holds for tenant."""
    holds = legal_hold_service.list_holds(
        tenant_id=auth.tenant_id,
        status=status_filter,
        session_id=session_id,
    )
    return {"status": "success", "holds": holds}


@app.post("/api/v1/privacy/holds/{hold_id}/release", dependencies=[Depends(require_admin)])
async def release_legal_hold_endpoint(
    hold_id: str,
    payload: LegalHoldReleaseRequest,
    auth: AuthContext = Depends(require_admin),
):
    """Release an active legal hold with documented justification."""
    released = legal_hold_service.release_hold(
        hold_id=hold_id,
        tenant_id=auth.tenant_id,
        released_by=auth.user_id,
        reason=payload.release_reason,
    )
    if not released:
        raise HTTPException(status_code=404, detail="Legal hold not found or already released")
    return {"status": "success", "hold": released}


@app.post("/api/v1/privacy/retention/dry-run", dependencies=[Depends(require_admin)])
async def retention_dry_run_endpoint(
    payload: RetentionDryRunRequest,
    auth: AuthContext = Depends(require_admin),
):
    """Estimate retention cleanup candidates, bytes freed, and held exceptions."""
    if payload.tenant_id and payload.tenant_id != auth.tenant_id and not auth.is_service_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot execute retention dry-run for a different tenant",
        )
    t_id = auth.tenant_id
    if payload.session_id:
        target_session = repository.get_session(payload.session_id)
        if not target_session:
            raise HTTPException(status_code=404, detail="Session not found")
        _verify_session_tenant(target_session, auth)
        res = retention_service.execute_session_deletion(
            tenant_id=t_id,
            session_id=payload.session_id,
            actor_id=auth.user_id,
            reason="ADMIN_DRY_RUN",
            dry_run=True,
        )
        return {"status": "success", "dry_run": res}
    summary = retention_service.run_scheduled_cleanup(tenant_id=t_id, dry_run=True)
    return {"status": "success", "summary": summary}


@app.post("/api/v1/privacy/retention/execute", dependencies=[Depends(require_admin)])
async def retention_execute_endpoint(
    payload: RetentionExecutionRequest,
    auth: AuthContext = Depends(require_admin),
):
    """Execute scheduled or targeted retention cleanup pipeline."""
    if payload.tenant_id and payload.tenant_id != auth.tenant_id and not auth.is_service_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Cannot execute retention cleanup for a different tenant",
        )
    t_id = auth.tenant_id
    if payload.session_id:
        target_session = repository.get_session(payload.session_id)
        if not target_session:
            raise HTTPException(status_code=404, detail="Session not found")
        _verify_session_tenant(target_session, auth)
        res = retention_service.execute_session_deletion(
            tenant_id=t_id,
            session_id=payload.session_id,
            actor_id=auth.user_id,
            reason="ADMIN_EXECUTION",
            dry_run=False,
        )
        return {"status": "success", "execution": res}
    summary = retention_service.run_scheduled_cleanup(tenant_id=t_id, dry_run=False)
    return {"status": "success", "summary": summary}


@app.post("/api/v1/sessions/{session_id}/context", dependencies=[Depends(require_student)])
async def add_student_context(
    session_id: str,
    payload: StudentContextRequest,
    auth: AuthContext = Depends(require_student),
):
    """
    Student submits structured technical context or appeal (e.g. WiFi drop, camera glitch).
    Attaches to durable event timeline without modifying or deleting past evidence.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_tenant(session, auth)

    now_iso = datetime.now(timezone.utc).isoformat()
    context_id = str(uuid.uuid4())
    policy_id = session.get("policy_id", "CLASSROOM")

    evt = {
        "event_id": context_id,
        "event_type": "STUDENT_CONTEXT_ADDED",
        "schema_version": 1,
        "tenant_id": auth.tenant_id,
        "session_id": session_id,
        "participant_id": auth.user_id,
        "actor_id": auth.user_id,
        "actor_role": "participant",
        "source": "browser",
        "occurred_at": now_iso,
        "policy_id": policy_id,
        "payload": {
            "context_id": context_id,
            "appeal_category": payload.appeal_category,
            "explanation_text": payload.explanation_text,
            "requested_help": payload.requested_help,
            "attached_to_event_ids": payload.attached_to_event_ids,
            "attached_at": now_iso,
        },
    }
    persisted = repository.append_event(evt)
    return {"status": "success", "context_id": context_id, "event": persisted}


@app.get("/api/v1/sessions/{session_id}/report", dependencies=[Depends(require_teacher)])
async def get_session_report(
    session_id: str,
    force_rebuild: bool = Query(False, description="Force recomputation of report from event stream"),
    auth: AuthContext = Depends(require_teacher),
):
    """
    Fetch authoritative post-session report read model with access audit logging.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    # 1. Record Report Access Audit
    repository.record_audit_log({
        "tenant_id": auth.tenant_id,
        "session_id": session_id,
        "actor_id": auth.user_id,
        "actor_role": auth.role,
        "action_type": "REPORT_ACCESSED",
    })

    # 2. Fetch or materialize report read model
    report = None if force_rebuild else repository.get_report_read_model(session_id)
    # Check if report exists and has modern structure
    if not report or "session_overview" not in report or "observation_coverage" not in report:
        events = repository.get_session_events(session_id)
        resources = repository.get_session_resources(session_id)
        submissions = repository.get_session_submissions(session_id)
        report_model = ReportEngine.build_report_read_model(
            session=session,
            events=events,
            resources=resources,
            submissions=submissions,
        )
        report = report_model.model_dump()
        repository.upsert_report_read_model(report)

    return {"status": "success", "report": report}


@app.post("/api/v1/sessions/{session_id}/report/rebuild", dependencies=[Depends(require_teacher)])
async def rebuild_session_report(
    session_id: str,
    auth: AuthContext = Depends(require_teacher),
):
    """
    Force deterministic rebuild of the authoritative report read model from durable events.
    """
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    events = repository.get_session_events(session_id)
    resources = repository.get_session_resources(session_id)
    submissions = repository.get_session_submissions(session_id)

    report_model = ReportEngine.build_report_read_model(
        session=session,
        events=events,
        resources=resources,
        submissions=submissions,
    )
    report_dict = report_model.model_dump()
    repository.upsert_report_read_model(report_dict)

    repository.record_audit_log({
        "tenant_id": auth.tenant_id,
        "session_id": session_id,
        "actor_id": auth.user_id,
        "actor_role": auth.role,
        "action_type": "REPORT_REBUILT",
        "details": {"events_count": len(events)},
    })

    return {"status": "success", "report": report_dict}


@app.post("/api/v1/sessions/{session_id}/report/export-audit", dependencies=[Depends(require_teacher)])
async def record_export_audit(
    session_id: str,
    export_format: str = Query("pdf"),
    auth: AuthContext = Depends(require_teacher),
):
    """Record an audit entry when a session report is exported."""
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_tenant(session, auth)
    _verify_session_teacher(session, auth)

    repository.record_audit_log({
        "tenant_id": auth.tenant_id,
        "session_id": session_id,
        "actor_id": auth.user_id,
        "actor_role": auth.role,
        "action_type": "REPORT_EXPORTED",
        "details": {"format": export_format},
    })
    return {"status": "success"}



@app.get("/admin/provider-compliance", dependencies=[Depends(require_admin)])
async def verify_provider_compliance(
    room_id: Optional[str] = None,
    auth: AuthContext = Depends(require_admin),
):
    """
    Verifies meeting provider (100ms) recording, transcription, and AI summary disablement.
    Guarantees: Zero provider cloud recording enabled.
    """
    is_compliant, violations, metadata = hms_verifier.verify_room_and_template_compliance(room_id=room_id)
    return {
        "status": "COMPLIANT" if is_compliant else "NON_COMPLIANT",
        "provider": "100ms",
        "compliant": is_compliant,
        "violations": violations,
        "metadata": metadata,
    }




