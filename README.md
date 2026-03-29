# Chronos

Chronos is a privacy-first engagement and identity intelligence layer for online classrooms.

It performs computer-vision inference on the client side and stores only embeddings and engagement analytics, not raw video frames.

## Tech stack

- **Frontend:** React, Vite, TensorFlow.js, MediaPipe
- **Backend:** FastAPI, WebSockets
- **Database/Auth:** Supabase
- **Video infrastructure:** 100ms

---

## Table of contents

- [Overview](#overview)
- [Local setup](#local-setup)
  - [1. Supabase setup](#1-supabase-setup)
  - [2. 100ms setup](#2-100ms-setup)
  - [3. Environment configuration](#3-environment-configuration)
  - [4. Run locally](#4-run-locally)
  - [5. Sanity check](#5-sanity-check)
  - [6. Troubleshooting](#6-troubleshooting)
  - [7. Pre-PR verification](#7-pre-pr-verification)
- [Complete testing guide](#complete-testing-guide)
  - [Prerequisites](#prerequisites)
  - [End-to-end validation flow](#end-to-end-validation-flow)
  - [Completion criteria](#completion-criteria)

---

## Overview

Chronos is designed for real-time classroom engagement monitoring and identity-aware participation workflows, with privacy built into the architecture from the start.

### Core principles

- Client-side inference for privacy-sensitive processing
- No storage of raw video frames
- Persistence of embeddings and analytics only
- Real-time classroom telemetry via WebSockets
- End-to-end flow across teacher and student experiences

---

## Local setup

Use the steps below to run the full Chronos stack locally.

## 1. Supabase setup

Chronos uses Supabase for authentication and database persistence.

### Create a project

Create a new project at [Supabase](https://supabase.com/).

### Disable email confirmations

For local testing, disable email confirmation so test accounts can sign up and log in immediately.

1. Go to **Authentication**
2. Open **Providers**
3. Select **Email**
4. Turn **Confirm email** off

### Create the required tables

Open the **SQL Editor** in Supabase and run the following SQL:

```sql
CREATE TABLE IF NOT EXISTS identity_embeddings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  embedding JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

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

---

## 2. 100ms setup

Chronos uses 100ms for WebRTC-based video conferencing.

### Create and configure your 100ms app

1. Create a free account at [100ms](https://100ms.live/)
2. Create a new app or workspace
3. Open **Developer settings**
4. Copy the following credentials:
   - **App Access Key**
   - **App Secret**

5. In the 100ms dashboard, create a room and copy:
   - **Room ID**
   - **Space ID** if your setup requires it

---

## 3. Environment configuration

Chronos has separate environment files for the backend and frontend.

### Backend

Path:

```bash
main/app/backend/
```

Copy `.env.example` to `.env` and add the following values:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

HMS_ACCESS_KEY=your-hms-access-key
HMS_SECRET=your-hms-secret
HMS_ROOM_ID=your-hms-room-id
HMS_SPACE_ID=your-hms-space-id

# Optional: token lifetime in minutes (default: 120)
HMS_TOKEN_TTL_MINUTES=120

# Optional: allowed frontend origin(s) in production, comma-separated
# CORS_ORIGINS=https://your-frontend.example.com
```

### Frontend

Path:

```bash
main/app/frontend/
```

Copy `.env.example` to `.env` and add the following values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

VITE_BACKEND_URL=http://localhost:8000
VITE_BACKEND_WS_URL=ws://localhost:8000
VITE_HMS_TOKEN_ENDPOINT=http://localhost:8000/hms-token
VITE_HMS_ENV=dev

# Optional: enable verbose engagement debug logs in development
VITE_DEBUG_LOGS=false
```

---

## 4. Run locally

You will need two terminal sessions.

### Start the backend

```bash
cd main/app/backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
# source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
```

### Start the frontend

```bash
cd main/app/frontend
npm install
npm run dev
```

Once both services are running, open: [http://localhost:5173](http://localhost:5173)

---

## 5. Sanity check

Use this quick validation before deeper testing.

### Expected behavior

1. The backend starts without a `Missing required environment variables` error
2. The frontend loads without the red `Environment Configuration Error` screen
3. A teacher can sign up, sign in, choose a role, and access the dashboard
4. A student can join from an incognito window and appear in teacher metrics
5. Ending a session generates a report that appears under **Past Sessions**

---

## 6. Troubleshooting

### `token is expired` during join

- Check that your system clock and timezone are correct
- Confirm your HMS credentials are valid
- Make sure `HMS_TOKEN_TTL_MINUTES` is set to a positive integer

### Frontend shows environment configuration error

- Verify that `main/app/frontend/.env` exists
- Confirm all required `VITE_*` variables are present
- Restart the frontend after updating `.env`

### Student is not visible or engagement is not updating

- Make sure camera permissions were granted
- Confirm the student completed readiness checks
- Verify that the backend is running
- Confirm the frontend WebSocket URL points to the correct backend

### Cross-origin request errors in deployment

- Set `CORS_ORIGINS` in the backend `.env`
- Include the deployed frontend origin(s), comma-separated if more than one

---

## 7. Pre-PR verification

Run these checks before opening a pull request.

### Frontend

```bash
cd main/app/frontend
npm run lint
npm run build
```

### Backend

Run from a shell where the backend virtual environment is activated:

```bash
cd main/app/backend
python -m compileall .
```

---

## Complete testing guide

Use the following flow to validate the product end to end.

## Prerequisites

Before testing, confirm:

1. Backend is running locally
2. Frontend is running locally
3. Environment configuration is complete

---

## End-to-end validation flow

### Step 1: Set up the teacher session

1. Open a standard Chrome window
2. Go to `http://localhost:5173`
3. Click **Sign Up**
4. Create a dummy teacher account
   Example: `teacher@chronos.local` / `password123`
5. Choose the **Teacher** role
6. Complete the readiness flow
7. Grant camera permission
8. Click **Verify & Join as Teacher**

### Step 2: Copy the session link

1. In the teacher dashboard, find the **Meeting ID / Copy Link** control
2. Copy the invite link

### Step 3: Set up the student session

1. Open a Chrome incognito window
2. Paste the invite link
3. Sign up with a different dummy account
   Example: `student@chronos.local` / `password123`
4. Choose the **Student** role

### Step 4: Complete readiness and identity checks

1. Finish the student readiness flow
2. Grant camera permission
3. Make sure the face is clearly visible and centered
4. Click **Verify** to enter the session

### Step 5: Validate real-time tracking

1. Keep the teacher and student windows visible side by side
2. As the student, look directly at the screen
3. Confirm the teacher sees attentive behavior or a higher score
4. Look away for 10 to 15 seconds
5. Confirm the teacher sees the score drop or disengagement indicators
6. Validate that nudges and teacher actions behave as expected

### Step 6: Validate network resilience

1. In the student window, open DevTools with `F12`
2. Open the **Network** tab
3. Set throttling to **Offline**
4. Confirm the reconnect banner appears
5. Switch back to **No throttling**
6. Confirm the session recovers successfully

### Step 7: Validate session report persistence

1. End the session from the teacher dashboard
2. Confirm the session report is generated
3. Open **Past Sessions**
4. Verify that session data persists correctly

---

## Completion criteria

Chronos can be considered working end to end when all of the following pass successfully:

- Authentication
- Teacher and student readiness flows
- Real-time engagement tracking
- WebSocket recovery behavior
- Session analytics persistence
- Report visibility in past sessions
