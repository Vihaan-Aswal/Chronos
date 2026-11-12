-- ============================================================================
-- Chronos Migration: 002_durable_events_and_projections.sql
-- Workstream W2: Domain Contracts, Event Log, and Projections
-- ============================================================================

-- 1. Custom Types & Enums
DO $$ BEGIN
    CREATE TYPE actor_role_enum AS ENUM ('participant', 'teacher', 'system', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE event_source_enum AS ENUM ('browser', 'camera', 'server', 'teacher', 'meeting_provider');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE event_type_enum AS ENUM (
        'SESSION_CREATED',
        'SESSION_STARTED',
        'SESSION_ENDED',
        'POLICY_CHANGED',
        'PARTICIPANT_JOINED',
        'PARTICIPANT_LEFT',
        'OBSERVATION_SAMPLE',
        'WINDOW_FINALIZED',
        'NO_DATA_ENTERED',
        'NO_DATA_EXITED',
        'CAMERA_STATE_CHANGED',
        'NETWORK_STATE_CHANGED',
        'IDENTITY_RESULT',
        'ACTIVE_PRESENCE_REQUESTED',
        'ACTIVE_PRESENCE_STARTED',
        'ACTIVE_PRESENCE_PASSED',
        'ACTIVE_PRESENCE_RETRY_REQUIRED',
        'ACTIVE_PRESENCE_TIMED_OUT',
        'ACTIVE_PRESENCE_DECLINED',
        'ACTIVE_PRESENCE_UNAVAILABLE',
        'PAGE_HIDDEN',
        'PAGE_VISIBLE',
        'WINDOW_BLURRED',
        'WINDOW_FOCUSED',
        'FULLSCREEN_ENTERED',
        'FULLSCREEN_EXITED',
        'RESOURCE_PUBLISHED',
        'RESOURCE_OPENED',
        'RESOURCE_CLOSED',
        'EXTERNAL_RESOURCE_CLICKED',
        'ANSWER_DRAFT_SAVED',
        'ANSWER_SUBMITTED',
        'ANSWER_REPLACED',
        'ANSWER_MARKED_LATE',
        'STUDENT_NUDGED',
        'STUDENT_CONTEXT_ADDED',
        'CASE_CREATED',
        'CASE_UPDATED',
        'CASE_RESOLVED',
        'TEACHER_ACTION_RECORDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


-- 2. Durable Append-Only Event Store
CREATE TABLE IF NOT EXISTS session_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_sequence BIGSERIAL NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    participant_id UUID NULL REFERENCES session_participants(id) ON DELETE SET NULL,
    event_type event_type_enum NOT NULL,
    schema_version INT NOT NULL DEFAULT 1,
    actor_id TEXT NOT NULL,
    actor_role actor_role_enum NOT NULL DEFAULT 'system',
    source event_source_enum NOT NULL DEFAULT 'server',
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    correlation_id UUID NULL,
    causation_id UUID NULL,
    policy_id policy_id_enum NOT NULL,
    policy_version TEXT NOT NULL DEFAULT 'v1',
    model_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    CONSTRAINT uq_session_server_sequence UNIQUE (session_id, server_sequence)
);

CREATE INDEX IF NOT EXISTS idx_session_events_session_seq ON session_events(tenant_id, session_id, server_sequence);
CREATE INDEX IF NOT EXISTS idx_session_events_participant ON session_events(session_id, participant_id, server_sequence);
CREATE INDEX IF NOT EXISTS idx_session_events_tenant_type_rec ON session_events(tenant_id, event_type, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_events_session_rec ON session_events(session_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_events_demo ON session_events(session_id, is_demo);


-- 3. Participant Projections Table
CREATE TABLE IF NOT EXISTS participant_projections (
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
    observation_state TEXT NOT NULL DEFAULT 'OBSERVABLE',
    coverage_ratio NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (coverage_ratio >= 0.00 AND coverage_ratio <= 1.00),
    active_reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    technical_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    attention_pattern TEXT NOT NULL DEFAULT 'UNKNOWN',
    warning_streak INT NOT NULL DEFAULT 0 CHECK (warning_streak >= 0),
    clean_streak INT NOT NULL DEFAULT 0 CHECK (clean_streak >= 0),
    identity_state TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    active_presence_state TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    browser_context TEXT NOT NULL DEFAULT 'NO_ACTIVE_EVENT',
    case_state TEXT NOT NULL DEFAULT 'NONE',
    student_context_count INT NOT NULL DEFAULT 0 CHECK (student_context_count >= 0),
    teacher_action_count INT NOT NULL DEFAULT 0 CHECK (teacher_action_count >= 0),
    last_event_sequence BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    PRIMARY KEY (session_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_participant_projections_case ON participant_projections(session_id, case_state);
CREATE INDEX IF NOT EXISTS idx_participant_projections_observation ON participant_projections(session_id, observation_state);


-- 4. Finalized Windows Table
CREATE TABLE IF NOT EXISTS finalized_windows (
    window_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    expected_segments INT NOT NULL CHECK (expected_segments > 0),
    usable_segments INT NOT NULL CHECK (usable_segments >= 0),
    coverage_ratio NUMERIC(4, 2) NOT NULL CHECK (coverage_ratio >= 0.00 AND coverage_ratio <= 1.00),
    observation_state TEXT NOT NULL,
    classification TEXT NOT NULL,
    cue_exposure_seconds NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (cue_exposure_seconds >= 0.00),
    warning_streak INT NOT NULL DEFAULT 0 CHECK (warning_streak >= 0),
    clean_streak INT NOT NULL DEFAULT 0 CHECK (clean_streak >= 0),
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    technical_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT chk_window_usable_lte_expected CHECK (usable_segments <= expected_segments),
    CONSTRAINT chk_window_timerange CHECK (window_end > window_start)
);

CREATE INDEX IF NOT EXISTS idx_finalized_windows_session_participant ON finalized_windows(session_id, participant_id, window_start ASC);
CREATE INDEX IF NOT EXISTS idx_finalized_windows_classification ON finalized_windows(session_id, classification);


-- 5. Session Cases Table
CREATE TABLE IF NOT EXISTS session_cases (
    case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    participant_id UUID NULL REFERENCES session_participants(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_ms BIGINT NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    status TEXT NOT NULL DEFAULT 'OPEN',
    priority TEXT NOT NULL DEFAULT 'LOW',
    event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    self_recovery_attempted BOOLEAN NOT NULL DEFAULT FALSE,
    student_context_count INT NOT NULL DEFAULT 0 CHECK (student_context_count >= 0),
    teacher_action_count INT NOT NULL DEFAULT 0 CHECK (teacher_action_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_session_cases_session_status ON session_cases(session_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_session_cases_participant ON session_cases(session_id, participant_id);


-- 6. Session Summaries Table
CREATE TABLE IF NOT EXISTS session_summaries (
    session_id UUID PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    total_participants INT NOT NULL DEFAULT 0 CHECK (total_participants >= 0),
    avg_attention_score NUMERIC(5, 2) NULL CHECK (avg_attention_score IS NULL OR (avg_attention_score >= 0.00 AND avg_attention_score <= 100.00)),
    total_cases INT NOT NULL DEFAULT 0 CHECK (total_cases >= 0),
    unresolved_cases INT NOT NULL DEFAULT 0 CHECK (unresolved_cases >= 0),
    technical_incidents_count INT NOT NULL DEFAULT 0 CHECK (technical_incidents_count >= 0),
    final_status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_summaries_tenant ON session_summaries(tenant_id, updated_at DESC);


-- 7. Resource Projections Table
CREATE TABLE IF NOT EXISTS resource_projections (
    resource_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('uploaded_pdf', 'uploaded_image', 'external_link')),
    title TEXT NOT NULL,
    description TEXT NULL,
    storage_path TEXT NULL,
    declared_url TEXT NULL,
    allowed_from TIMESTAMPTZ NULL,
    allowed_until TIMESTAMPTZ NULL,
    required BOOLEAN NOT NULL DEFAULT FALSE,
    immutable_after_start BOOLEAN NOT NULL DEFAULT TRUE,
    content_hash TEXT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resource_projections_session ON resource_projections(session_id);


-- 8. Answer Projections Table
CREATE TABLE IF NOT EXISTS answer_projections (
    answer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'REPLACED', 'LATE')),
    content_hash TEXT NULL,
    byte_size BIGINT NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
    storage_path TEXT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_late BOOLEAN NOT NULL DEFAULT FALSE,
    
    CONSTRAINT uq_session_participant_version UNIQUE (session_id, participant_id, version)
);

CREATE INDEX IF NOT EXISTS idx_answer_projections_lookup ON answer_projections(session_id, participant_id, status);


-- 9. Report Read Models Table
CREATE TABLE IF NOT EXISTS report_read_models (
    session_id UUID PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    timeline_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    technical_health_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    identity_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    browser_context_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    case_resolution_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    answer_submissions_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_read_models_tenant ON report_read_models(tenant_id, generated_at DESC);


-- 10. Append-Only Enforcer Trigger for session_events
CREATE OR REPLACE FUNCTION prevent_session_event_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Chronos Invariant Violation: session_events is an immutable append-only event store. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_events_append_only ON session_events;
CREATE TRIGGER trg_session_events_append_only
BEFORE UPDATE OR DELETE ON session_events
FOR EACH ROW EXECUTE FUNCTION prevent_session_event_modification();
