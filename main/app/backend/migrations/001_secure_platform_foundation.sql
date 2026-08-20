-- ============================================================================
-- Chronos Migration: 001_secure_platform_foundation.sql
-- Workstream W1: Authentication, Tenancy, and Secure Session Foundation
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Enums
DO $$ BEGIN
    CREATE TYPE tenant_role_enum AS ENUM ('admin', 'teacher', 'student');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE session_status_enum AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE policy_id_enum AS ENUM (
        'CLASSROOM',
        'RESOURCE_SUPPORTED_ASSESSMENT',
        'SUPERVISED_ASSESSMENT',
        'NO_ANALYTICS'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE participant_role_enum AS ENUM ('teacher', 'student', 'guest');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE participant_status_enum AS ENUM ('INVITED', 'ADMITTED', 'DECLINED', 'REMOVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


-- 2. Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 3. Tenant Memberships Table
CREATE TABLE IF NOT EXISTS tenant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role tenant_role_enum NOT NULL DEFAULT 'student',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenant_user UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_user ON tenant_members(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON tenant_members(user_id);


-- 4. Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    teacher_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status session_status_enum NOT NULL DEFAULT 'DRAFT',
    policy_id policy_id_enum NOT NULL DEFAULT 'CLASSROOM',
    policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    room_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT chk_session_timestamps CHECK (
        ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at
    )
);

CREATE INDEX IF NOT EXISTS idx_sessions_tenant_status ON sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher ON sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);


-- 5. Session Participants Table
CREATE TABLE IF NOT EXISTS session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role participant_role_enum NOT NULL DEFAULT 'student',
    status participant_status_enum NOT NULL DEFAULT 'INVITED',
    joined_at TIMESTAMPTZ NULL,
    left_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT uq_session_participant UNIQUE (session_id, user_id),
    CONSTRAINT chk_participant_timestamps CHECK (
        left_at IS NULL OR joined_at IS NULL OR left_at >= joined_at
    )
);

CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_user_session ON session_participants(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_tenant ON session_participants(tenant_id);
