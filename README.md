# Chronos

Chronos is a privacy-first engagement and identity intelligence layer for online classrooms. It runs computer-vision inference client-side and stores embeddings and engagement analytics rather than raw video frames.

Built with React + Vite, FastAPI, WebSockets, Supabase, TensorFlow.js, and MediaPipe.

---

## Zero to Running: Tester Walkthrough

Follow these instructions to spin up the entire Chronos stack locally in under 10 minutes.

### 1. Supabase Setup

Chronos relies on Supabase for Auth and Database persistence.

1. Create a new project on [Supabase.com](https://supabase.com/).
2. **Disable Email Confirmations:**
   - Go to **Authentication** > **Providers** > **Email**.
   - Toggle **Confirm email** to OFF. This allows testers to create dummy accounts and login instantly without verifying emails.
3. **Database Schema Setup:**
   - Go to the **SQL Editor** in Supabase.
   - Run the following snippet to create the required tables:

```sql
-- Create Identity Embeddings Table
CREATE TABLE IF NOT EXISTS identity_embeddings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  embedding JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Session Analytics Table
CREATE TABLE IF NOT EXISTS session_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes FLOAT NOT NULL,
  avg_engagement_score FLOAT NOT NULL,
  total_students INTEGER NOT NULL,
  metrics_timeline JSONB DEFAULT '[]'::jsonb,
  confusion_hotspots JSONB DEFAULT '[]'::jsonb,
  at_risk_students JSONB DEFAULT '[]'::jsonb,
  tpi FLOAT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### 2. 100ms (HMS) Setup

Chronos uses 100ms for WebRTC video conferencing.

1. Create a free account at [100ms.live](https://100ms.live/).
2. Create a new App / Workspace.
3. Access your **Developer** settings to get your **App Access Key** and **App Secret**.
4. In the 100ms dashboard, navigate to **Rooms** and create one. Copy the **Room ID**. (Optional: Space ID if needed by your config).

### 3. Environment Configuration

The project is split into `backend` and `frontend`. You must configure environment variables for both.

**Backend (`main/app/backend/`):**
Copy `.env.example` to `.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

HMS_ACCESS_KEY=your-hms-access-key
HMS_SECRET=your-hms-secret
HMS_ROOM_ID=your-hms-room-id
HMS_SPACE_ID=your-hms-space-id
# Optional: token lifetime in minutes (defaults to 120)
HMS_TOKEN_TTL_MINUTES=120
# Optional: set allowed frontend origin(s) in production (comma-separated)
# CORS_ORIGINS=https://your-frontend.example.com
```

**Frontend (`main/app/frontend/`):**
Copy `.env.example` to `.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

VITE_BACKEND_URL=http://localhost:8000
VITE_BACKEND_WS_URL=ws://localhost:8000
VITE_HMS_TOKEN_ENDPOINT=http://localhost:8000/hms-token
VITE_HMS_ENV=dev
# Optional: enable verbose engagement debug logs in development
VITE_DEBUG_LOGS=false
```

### 4. Running Locally

You'll need two terminal windows open.

**Terminal 1: Start the Backend (FastAPI)**

```bash
cd main/app/backend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
# source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
```

**Terminal 2: Start the Frontend (Vite)**

```bash
cd main/app/frontend
npm install
npm run dev
```

The app will now be available at `http://localhost:5173`.

### 5. Quick Sanity Check (2 Minutes)

1. Backend terminal should start without the `Missing required environment variables` fatal error.
2. Frontend should open normally and must not show the red `Environment Configuration Error` screen.
3. Teacher can sign up/sign in, select role, and enter dashboard.
4. Student can open invite link in incognito and appear in teacher dashboard metrics.
5. Ending a teacher session should generate a report and show in Past Sessions.

### 6. Troubleshooting

1. `token is expired` during meeting join:

- Ensure system clock/timezone is correct on your machine.
- Verify backend has valid HMS keys and `HMS_TOKEN_TTL_MINUTES` is a positive integer.

2. Frontend shows environment error overlay on load:

- Confirm `main/app/frontend/.env` exists and all `VITE_*` variables are set.
- Restart `npm run dev` after editing `.env`.

3. Student not visible or engagement not updating:

- Confirm student granted camera permission and completed readiness.
- Confirm backend is running and websocket URL in frontend `.env` points to backend.

4. Cross-origin request errors in deployed environment:

- Set `CORS_ORIGINS` in backend `.env` to your deployed frontend URL(s).

### 7. Contributor Verification Commands

Run these before opening a PR:

```bash
# frontend
cd main/app/frontend
npm run lint
npm run build

# backend (from a shell with backend venv activated)
cd main/app/backend
python -m compileall .
```

---

## Complete Testing Guide

Use this deterministic flow to validate the full product experience end-to-end.

### Prerequisites

1. Backend and frontend are both running locally.
2. Environment setup is completed using the sections above.

### The Golden Path

### Step 1: Initialize the Teacher Dashboard

1. Open a **standard Chrome window** (recommended for MediaPipe compatibility).
2. Navigate to `http://localhost:5173`.
3. Click **Sign Up** and create a dummy teacher account (example: `teacher@chronos.local` / `password123`).
4. On role selection, choose **Teacher**.
5. Complete the readiness check and grant camera permission.
6. Click **Verify & Join as Teacher**.

### Step 2: Retrieve the Session Link

1. In the Teacher Dashboard, locate the **Meeting ID / Copy Link** control.
2. Copy the invite link.

### Step 3: Initialize the Student Environment

1. Open a **Chrome Incognito window** (isolates local session/camera context).
2. Paste the copied link.
3. Sign up with a separate dummy account (example: `student@chronos.local` / `password123`).
4. Select **Student**.

### Step 4: Validate Identity and Readiness

1. Complete student readiness checks.
2. Confirm camera permission is granted.
3. Ensure face is centered and lighting is acceptable.
4. Click Verify to enter class.

### Step 5: Validate Real-Time Tracking

1. Keep teacher and student windows side by side.
2. As student, look at the screen: teacher should show attentive/high score.
3. Look away for 10-15 seconds: teacher should see score drop and/or disengagement behavior.
4. Confirm nudges and teacher actions behave as expected.

### Step 6: Validate Network Resilience

1. In student window, open DevTools (F12) > Network.
2. Set throttling to **Offline**.
3. Confirm the red reconnect banner appears.
4. Set throttling back to **No throttling** and confirm recovery.

### Step 7: Validate Session Report Persistence

1. End session from teacher dashboard.
2. Confirm session report appears.
3. Open **Past Sessions** and verify data persists.

### Completion Criteria

If all steps above pass, the core Chronos experience (auth, readiness, live tracking, websocket resilience, analytics persistence) is working end-to-end.
