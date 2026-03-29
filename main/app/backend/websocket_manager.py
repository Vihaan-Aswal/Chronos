from fastapi import WebSocket
import json

class ConnectionManager:
    """
    Manages WebSocket connections for students and teachers per session.

    Structure:
    {
        session_id: {
            "students": { user_id: websocket },
            "teachers": set([websocket])
        }
    }
    """

    def __init__(self):
        self.connections = {}  # session_id → dict


    # STUDENT CONNECT / DISCONNECT
    async def connect_student(self, session_id: str, user_id: str, websocket: WebSocket):
        await websocket.accept()

        if session_id not in self.connections:
            self.connections[session_id] = {
                "students": {},
                "teachers": set()
            }

        self.connections[session_id]["students"][user_id] = websocket
        print(f"[MANAGER] Student {user_id} joined {session_id}")

    def disconnect_student(self, session_id: str, user_id: str):
        try:
            if session_id in self.connections:
                students = self.connections[session_id]["students"]
                if user_id in students:
                    del students[user_id]
                    print(f"[MANAGER] Student {user_id} removed from {session_id}")

                # cleanup session if empty
                if not students and not self.connections[session_id]["teachers"]:
                    del self.connections[session_id]
                    print(f"[MANAGER] Session {session_id} cleaned up")
        except Exception as e:
            print("[MANAGER ERROR] disconnect_student:", e)


    # TEACHER CONNECT / DISCONNECT
    async def connect_teacher(self, session_id: str, websocket: WebSocket):
        await websocket.accept()

        if session_id not in self.connections:
            self.connections[session_id] = {
                "students": {},
                "teachers": set()
            }

        self.connections[session_id]["teachers"].add(websocket)
        print(f"[MANAGER] Teacher joined session {session_id}")

    def disconnect_teacher(self, session_id: str, websocket: WebSocket):
        try:
            if session_id in self.connections:
                teachers = self.connections[session_id]["teachers"]

                if websocket in teachers:
                    teachers.remove(websocket)
                    print(f"[MANAGER] Teacher left session {session_id}")

                # cleanup session if empty
                if not teachers and not self.connections[session_id]["students"]:
                    del self.connections[session_id]
                    print(f"[MANAGER] Session {session_id} cleaned up")

        except Exception as e:
            print("[MANAGER ERROR] disconnect_teacher:", e)


    # BROADCAST: student → all teachers

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

        # remove dead teacher sockets
        for d in dead:
            print("[MANAGER] Removing dead teacher WS")
            self.connections[session_id]["teachers"].discard(d)


    # BROADCAST: to all students in session (e.g. session_mode)
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

    # SEND direct message: teacher → student

    async def send_to_student(self, session_id: str, user_id: str, message: dict) -> bool:
        if session_id not in self.connections:
            print("[MANAGER] session not found:", session_id)
            return False

        students = self.connections[session_id]["students"]
        if user_id not in students:
            print("[MANAGER] student not found:", user_id)
            return False

        try:
            ws = students[user_id]
            await ws.send_text(json.dumps(message))
            return True
        except Exception as e:
            print("[MANAGER ERROR] send_to_student:", e)
            self.disconnect_student(session_id, user_id)
            return False


# global instance
manager = ConnectionManager()
