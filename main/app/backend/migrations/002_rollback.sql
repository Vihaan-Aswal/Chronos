-- ============================================================================
-- Chronos Migration Rollback: 002_rollback.sql
-- Workstream W2: Domain Contracts, Event Log, and Projections
-- ============================================================================

DROP TRIGGER IF EXISTS trg_session_events_append_only ON session_events;
DROP FUNCTION IF EXISTS prevent_session_event_modification();

DROP TABLE IF EXISTS report_read_models CASCADE;
DROP TABLE IF EXISTS answer_projections CASCADE;
DROP TABLE IF EXISTS resource_projections CASCADE;
DROP TABLE IF EXISTS session_summaries CASCADE;
DROP TABLE IF EXISTS session_cases CASCADE;
DROP TABLE IF EXISTS finalized_windows CASCADE;
DROP TABLE IF EXISTS participant_projections CASCADE;
DROP TABLE IF EXISTS session_events CASCADE;

DROP TYPE IF EXISTS event_type_enum CASCADE;
DROP TYPE IF EXISTS event_source_enum CASCADE;
DROP TYPE IF EXISTS actor_role_enum CASCADE;
