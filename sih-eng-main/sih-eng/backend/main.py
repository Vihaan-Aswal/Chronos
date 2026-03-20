from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import os, json, math, time, jwt
from dotenv import load_dotenv
from websocket_manager import manager
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any


load_dotenv()


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# HMS
HMS_ACCESS_KEY = os.getenv("HMS_ACCESS_KEY")
HMS_SECRET = os.getenv("HMS_SECRET")
HMS_ROOM_ID = os.getenv("HMS_ROOM_ID")  
HMS_SPACE_ID = os.getenv("HMS_SPACE_ID")

if not HMS_ACCESS_KEY or not HMS_SECRET or not HMS_ROOM_ID:
    raise RuntimeError("Missing HMS_ACCESS_KEY / HMS_SECRET / HMS_ROOM_ID")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")


supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


app = FastAPI()

# CORS: use CORS_ORIGINS env in production (e.g. "https://your-app.vercel.app")
# Default: localhost for dev
_cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
CORS_ORIGINS_LIST = [o.strip() for o in _cors_origins.split(",") if o.strip()] or ["http://localhost:5173", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS_LIST,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




# IDENTITY 

class EmbeddingPayload(BaseModel):
    user_id: str
    embedding: list[float]


class NudgePayload(BaseModel):
    session_id: str
    user_id: str
    nudge_type: str


class SessionModePayload(BaseModel):
    session_id: str
    mode: str  # "strict" | "normal"


class TeacherActionPayload(BaseModel):
    session_id: str
    user_id: str
    action: str  # "mark_engaged" | "ignore" | "remove" | "message"
    message_text: Optional[str] = None  # for action "message"


class LivenessTriggerPayload(BaseModel):
    session_id: str
    user_id: Optional[str] = None  # if None, broadcast to all


# SESSION ANALYTICS 

class SessionMetric(BaseModel):
    timestamp: str
    avg_score: float
    student_count: int


class ConfusionHotspot(BaseModel):
    time: str
    percentage: int
    student_count: int
    timestamp: str


class AtRiskStudent(BaseModel):
    userId: str
    avgScore: float
    strikes: int


class SessionAnalyticsPayload(BaseModel):
    session_id: str
    teacher_id: str
    start_time: str
    end_time: str
    duration_minutes: float
    avg_engagement_score: float
    total_students: int
    metrics_timeline: List[Dict[str, Any]]
    confusion_hotspots: Optional[List[ConfusionHotspot]] = []
    at_risk_students: Optional[List[AtRiskStudent]] = []
    tpi: Optional[float] = None


def normalize_vec(v: list[float]) -> list[float]:
    try:
        s = sum(float(x) * float(x) for x in v)
        if s <= 0:
            return v
        n = math.sqrt(s)
        return [float(x) / n for x in v]
    except:
        return v


def is_finite_array(v: list) -> bool:
    try:
        return all(isinstance(x, (int, float)) and math.isfinite(float(x)) for x in v)
    except:
        return False





@app.post("/identity/register")
def register_embedding(payload: EmbeddingPayload):
    if not payload.embedding or not is_finite_array(payload.embedding):
        raise HTTPException(status_code=400, detail="invalid embedding")

    emb = normalize_vec(payload.embedding)
    supabase.table("identity_embeddings").upsert(
        {"user_id": payload.user_id, "embedding": emb}
    ).execute()

    return {"status": "success"}


@app.get("/identity/{user_id}")
def get_embedding(user_id: str):
    result = supabase.table("identity_embeddings").select("*").eq("user_id", user_id).execute()
    if not result.data:
        return {"exists": False}
    return {
        "exists": True,
        "embedding": result.data[0]["embedding"]
    }


# SESSION ANALYTICS ENDPOINTS 

@app.post("/session/save-analytics")
def save_session_analytics(payload: SessionAnalyticsPayload):
    """
    Save session analytics to Supabase with confusion hotspots and at-risk students
    """
    try:
        # Convert metrics timeline to JSON
        metrics_json = [m for m in payload.metrics_timeline]
        
        # Convert confusion hotspots
        confusion_json = [h.dict() if hasattr(h, 'dict') else h for h in payload.confusion_hotspots] if payload.confusion_hotspots else []
        
        # Convert at-risk students
        at_risk_json = [s.dict() if hasattr(s, 'dict') else s for s in payload.at_risk_students] if payload.at_risk_students else []
        
        data = {
            "session_id": payload.session_id,
            "teacher_id": payload.teacher_id,
            "start_time": payload.start_time,
            "end_time": payload.end_time,
            "duration_minutes": payload.duration_minutes,
            "avg_engagement_score": payload.avg_engagement_score,
            "total_students": payload.total_students,
            "metrics_timeline": metrics_json,
            "confusion_hotspots": confusion_json,
            "at_risk_students": at_risk_json,
            "created_at": datetime.utcnow().isoformat()
        }
        if payload.tpi is not None:
            data["tpi"] = payload.tpi
        
        result = supabase.table("session_analytics").insert(data).execute()
        
        if result.data:
            return {"status": "success", "id": result.data[0].get("id")}
        else:
            raise HTTPException(status_code=500, detail="Failed to save analytics")
            
    except Exception as e:
        print(f"[SESSION ANALYTICS] Error saving: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error saving analytics: {str(e)}")


@app.get("/session/analytics/list")
def list_session_analytics(teacher_id: str):
    """List past sessions for a teacher"""
    try:
        result = supabase.table("session_analytics")\
            .select("id, session_id, teacher_id, start_time, end_time, duration_minutes, avg_engagement_score, total_students, created_at")\
            .eq("teacher_id", teacher_id)\
            .order("created_at", desc=True)\
            .limit(50)\
            .execute()
        if not result.data:
            return {"sessions": []}
        return {"sessions": result.data}
    except Exception as e:
        print(f"[SESSION ANALYTICS] Error listing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/session/{session_id}/analytics")
def get_session_analytics(session_id: str):
    """
    Retrieve session analytics
    """
    try:
        result = supabase.table("session_analytics")\
            .select("*")\
            .eq("session_id", session_id)\
            .order("created_at", desc=True)\
            .execute()
        
        if not result.data:
            return {"exists": False}
        
        return {
            "exists": True,
            "analytics": result.data
        }
    except Exception as e:
        print(f"[SESSION ANALYTICS] Error fetching: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching analytics: {str(e)}")


# HMS TOKEN ENDPOINT

class TokenRequest(BaseModel):
    user_name: str
    role: str


@app.post("/hms-token")
def hms_token(req: TokenRequest):
    """
    Generate HMS auth token using JWT
    """
    import uuid
    
    now = datetime.utcnow()
    exp = now + timedelta(hours=24)  # Token valid for 24 hours

    payload = {
        "access_key": HMS_ACCESS_KEY,
        "room_id": HMS_ROOM_ID,
        "user_id": req.user_name,
        "role": req.role,
        "type": "app",
        "version": 2,
        "jti": str(uuid.uuid4()),  
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(exp.timestamp())
    }

    print(f"[HMS] Generating token for user: {req.user_name}, role: {req.role}")
    print(f"[HMS] Payload: {payload}")

    try:
        # Generate JWT token using HMS_SECRET as the signing key
        token = jwt.encode(
            payload,
            HMS_SECRET,
            algorithm="HS256"
        )

        print(f"[HMS] Token generated successfully")
        
        return {
            "token": token
        }

    except Exception as e:
        print(f"[HMS] Token generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Token generation failed: {str(e)}")


# STUDENT WS 

@app.websocket("/ws/engagement/{session_id}/{user_id}")
async def student_ws(websocket: WebSocket, session_id: str, user_id: str):
    await manager.connect_student(session_id, user_id, websocket)
    print(f"[WS] Student connected: {user_id} in {session_id}")

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            enriched = {
                **msg,
                "session_id": session_id,
                "user_id": user_id,
                "timestamp": msg.get("timestamp") or datetime.utcnow().isoformat()
            }
            await manager.broadcast_to_teachers(session_id, enriched)

    except WebSocketDisconnect:
        print(f"[WS] Student disconnected: {user_id}")
        manager.disconnect_student(session_id, user_id)


# TEACHER WS 

@app.websocket("/ws/teacher/{session_id}")
async def teacher_ws(websocket: WebSocket, session_id: str):
    await manager.connect_teacher(session_id, websocket)
    print(f"[WS] Teacher connected to session {session_id}")

    try:
        while True:
            await websocket.receive_text()
    except:
        pass
    finally:
        print(f"[WS] Teacher disconnected from {session_id}")
        manager.disconnect_teacher(session_id, websocket)


# SESSION MODE (Strict / Normal for anti-tab-switching)

@app.post("/session/set-mode")
async def set_session_mode(payload: SessionModePayload):
    if payload.mode not in ("strict", "normal"):
        raise HTTPException(status_code=400, detail="mode must be 'strict' or 'normal'")
    msg = {"type": "session_mode", "mode": payload.mode}
    await manager.broadcast_to_students(payload.session_id, msg)
    return {"status": "success", "mode": payload.mode}


# LIVENESS VERIFICATION

import random

LIVENESS_ACTIONS = [
    {"id": "turn_head_left", "label": "Turn your head left"},
    {"id": "turn_head_right", "label": "Turn your head right"},
    {"id": "turn_head_up", "label": "Look up"},
    {"id": "turn_head_down", "label": "Look down"},
    {"id": "smile", "label": "Smile"},
    {"id": "look_right_smile", "label": "Look right and smile"},
    {"id": "look_left_smile", "label": "Look left and smile"},
]


@app.post("/liveness/trigger")
async def trigger_liveness(payload: LivenessTriggerPayload):
    action = random.choice(LIVENESS_ACTIONS)
    expires_sec = random.randint(3, 5)
    msg = {
        "type": "liveness_challenge",
        "action_id": action["id"],
        "action_label": action["label"],
        "expires_at": (datetime.utcnow().timestamp() + expires_sec) * 1000,
        "expires_sec": expires_sec,
    }
    if payload.user_id:
        await manager.send_to_student(payload.session_id, payload.user_id, msg)
    else:
        await manager.broadcast_to_students(payload.session_id, msg)
    return {"status": "success", "action": action, "expires_sec": expires_sec}


# TEACHER ACTIONS (mark engaged, ignore, remove, message)

@app.post("/teacher/action")
async def teacher_action(payload: TeacherActionPayload):
    if payload.action not in ("mark_engaged", "ignore", "remove", "message"):
        raise HTTPException(status_code=400, detail="action must be mark_engaged, ignore, remove, or message")
    msg = {"type": "teacher_action", "action": payload.action}
    if payload.action == "message" and payload.message_text:
        msg["message_text"] = payload.message_text
    ok = await manager.send_to_student(payload.session_id, payload.user_id, msg)
    if not ok:
        return {"status": "error", "message": "student not found"}
    return {"status": "success"}


# TEACHER NUDGE 

@app.post("/nudge/send")
async def send_nudge(payload: NudgePayload):
    msg = {"type": "nudge", "nudge_type": payload.nudge_type}
    ok = await manager.send_to_student(payload.session_id, payload.user_id, msg)
    if not ok:
        return {"status": "error", "message": "student not found"}
    return {"status": "success"}



