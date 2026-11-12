-- ============================================================================
-- Chronos Migration: 003_retention_holds_and_privacy.sql
-- Workstream W6: Retention Classification, Legal Holds, and Deletion Engine
-- Specification: PRIVACY_DATA_MODEL.md & QUALITY_REQUIREMENTS.md
-- ============================================================================

-- 1. Granular Consent Records Table
CREATE TABLE IF NOT EXISTS consent_records (
    consent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    session_id UUID NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    scope TEXT NOT NULL, -- e.g. 'LIVE_SESSION_PARTICIPATION', 'CAMERA_LOCAL_PROCESSING', 'IDENTITY_ENROLLMENT', 'IDENTITY_VERIFICATION', 'ACTIVE_PRESENCE_CHECKS', 'ATTENTION_TELEMETRY', 'BROWSER_CONTEXT_TELEMETRY', 'ANSWER_STORAGE'
    policy_version TEXT NOT NULL DEFAULT 'v1',
    grant_or_decline TEXT NOT NULL CHECK (grant_or_decline IN ('GRANT', 'DECLINE')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    withdrawn_at TIMESTAMPTZ NULL,
    actor_type TEXT NOT NULL DEFAULT 'student',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_subject_session_scope UNIQUE (tenant_id, session_id, subject_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_consent_subject_scope 
ON consent_records(tenant_id, subject_id, scope);

CREATE INDEX IF NOT EXISTS idx_consent_session 
ON consent_records(session_id);

-- 2. Legal / Institutional Holds Table
CREATE TABLE IF NOT EXISTS legal_holds (
    hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subject_id TEXT NULL,                       -- NULL means entire session/tenant hold
    session_id UUID NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    data_classes JSONB NOT NULL DEFAULT '["ALL"]'::jsonb, -- e.g. ["TELEMETRY", "ANSWERS", "REPORTS"]
    reason TEXT NOT NULL,
    approver_id TEXT NOT NULL,
    approver_email TEXT NOT NULL,
    notes TEXT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiry_or_review_date TIMESTAMPTZ NOT NULL,
    released_at TIMESTAMPTZ NULL,
    released_by TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_active 
ON legal_holds(tenant_id, status, session_id, subject_id);

-- 3. Deletion Requests & Lifecycle Queue
CREATE TABLE IF NOT EXISTS deletion_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    session_id UUID NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    data_classes JSONB NOT NULL DEFAULT '["ALL"]'::jsonb,
    request_type TEXT NOT NULL DEFAULT 'DSR_ERASURE' CHECK (request_type IN ('DSR_ERASURE', 'RETENTION_EXPIRY', 'ADMIN_PURGE')),
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'PROCESSING', 'COMPLETED', 'BLOCKED_BY_HOLD', 'FAILED')),
    requested_by TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ NULL,
    records_deleted_count INT NOT NULL DEFAULT 0,
    bytes_deleted_count BIGINT NOT NULL DEFAULT 0,
    failure_reason TEXT NULL,
    tombstone_id UUID NULL
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_lookup 
ON deletion_requests(tenant_id, subject_id, status);

-- 4. Minimal Deletion Audit Tombstones (Privacy-Safe Immutable Record)
CREATE TABLE IF NOT EXISTS deletion_audit_tombstones (
    tombstone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subject_id_hash TEXT NOT NULL, -- SHA-256 HMAC of subject ID (no plaintext PII)
    session_id UUID NULL,
    request_id UUID NOT NULL,
    data_classes_deleted JSONB NOT NULL,
    records_deleted_count INT NOT NULL,
    bytes_deleted_count BIGINT NOT NULL,
    initiated_by TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tombstones_tenant 
ON deletion_audit_tombstones(tenant_id, deleted_at DESC);

-- 5. Governance Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action_type TEXT NOT NULL, -- 'REPORT_ACCESSED', 'REPORT_EXPORTED', 'TEACHER_ACTION', 'CONSENT_GRANTED', 'CONSENT_WITHDRAWN', 'DELETION_EXECUTED', 'LEGAL_HOLD_APPLIED', 'LEGAL_HOLD_RELEASED'
    target_resource TEXT NULL,
    target_user_id TEXT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_action 
ON audit_logs(tenant_id, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_session 
ON audit_logs(session_id, created_at DESC);
