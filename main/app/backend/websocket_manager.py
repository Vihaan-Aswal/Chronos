"""
Chronos WebSocket Connection Manager
Manages authenticated, session-bound WebSocket connections for students and teachers.
"""
from typing import Dict, Optional, Set
from fastapi import WebSocket
import json
from chronos_logging import get_logger

logger = get_logger("chronos.ws_manager")


class ConnectionManager:
    """
    Manages WebSocket connections for students and teachers per session.

    Structure:
    {
        session_id: {
            "students": { user_id: websocket },
            "teachers": set([websocket]),
            "teacher_ids": { websocket: teacher_id }
        }
    }
    """

    def __init__(self):
        self.connections: Dict[str, Dict] = {}

    def _ensure_session(self, session_id: str):
        if session_id not in self.connections:
            self.connections[session_id] = {
                "students": {},
                "teachers": set(),
                "teacher_ids": {},
            }

    # STUDENT CONNECT / DISCONNECT
    async def connect_student(
        self, session_id: str, user_id: str, websocket: WebSocket
    ):
        await websocket.accept()
        self._ensure_session(session_id)
        self.connections[session_id]["students"][user_id] = websocket
        logger.info(
            f"Student joined session WebSocket",
            extra={
                "event_type": "WS_STUDENT_CONNECTED",
                "session_id": session_id,
                "participant_id": user_id,
            },
        )

    def disconnect_student(self, session_id: str, user_id: str):
        try:
            if session_id in self.connections:
                students = self.connections[session_id]["students"]
                if user_id in students:
                    del students[user_id]
                    logger.info(
                        f"Student disconnected from session WebSocket",
                        extra={
                            "event_type": "WS_STUDENT_DISCONNECTED",
                            "session_id": session_id,
                            "participant_id": user_id,
                        },
                    )

                # cleanup session if empty
                if not students and not self.connections[session_id]["teachers"]:
                    del self.connections[session_id]
        except Exception as e:
            logger.error(f"Error disconnecting student: {e}")

    # TEACHER CONNECT / DISCONNECT
    async def connect_teacher(
        self, session_id: str, websocket: WebSocket, teacher_id: Optional[str] = None
    ):
        await websocket.accept()
        self._ensure_session(session_id)
        self.connections[session_id]["teachers"].add(websocket)
        if teacher_id:
            self.connections[session_id]["teacher_ids"][websocket] = teacher_id
        logger.info(
            f"Teacher connected to session WebSocket",
            extra={
                "event_type": "WS_TEACHER_CONNECTED",
                "session_id": session_id,
                "participant_id": teacher_id or "teacher",
            },
        )

    def disconnect_teacher(self, session_id: str, websocket: WebSocket):
        try:
            if session_id in self.connections:
                teachers = self.connections[session_id]["teachers"]
                if websocket in teachers:
                    teachers.remove(websocket)
                if websocket in self.connections[session_id]["teacher_ids"]:
                    del self.connections[session_id]["teacher_ids"][websocket]

                logger.info(
                    f"Teacher disconnected from session WebSocket",
                    extra={
                        "event_type": "WS_TEACHER_DISCONNECTED",
                        "session_id": session_id,
                    },
                )

                # cleanup session if empty
                if not teachers and not self.connections[session_id]["students"]:
                    del self.connections[session_id]
        except Exception as e:
            logger.error(f"Error disconnecting teacher: {e}")

    # BROADCAST: student -> all teachers in session
    async def broadcast_to_teachers(self, session_id: str, message: dict):
        if session_id not in self.connections:
            return

        teachers = list(self.connections[session_id]["teachers"])
        if not teachers:
            return

        msg = json.dumps(message)
        dead = []

        for ws in teachers:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)

        for d in dead:
            self.disconnect_teacher(session_id, d)

    # BROADCAST: to all students in session
    async def broadcast_to_students(self, session_id: str, message: dict):
        if session_id not in self.connections:
            return
        students = self.connections[session_id]["students"]
        msg = json.dumps(message)
        dead = []
        for uid, ws in list(students.items()):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.disconnect_student(session_id, uid)

    # SEND DIRECT: teacher -> specific student in session
    async def send_to_student(
        self, session_id: str, user_id: str, message: dict
    ) -> bool:
        if session_id not in self.connections:
            return False

        students = self.connections[session_id]["students"]
        if user_id not in students:
            return False

        try:
            ws = students[user_id]
            await ws.send_text(json.dumps(message))
            return True
        except Exception as e:
            logger.error(f"Error sending message to student {user_id}: {e}")
            self.disconnect_student(session_id, user_id)
            return False


# Global singleton instance
manager = ConnectionManager()
