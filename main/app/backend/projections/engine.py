"""
Chronos Pure Deterministic Projection Engine
Workstream W2: Domain Contracts and Event Persistence

Provides pure mathematical reducers that transform immutable event streams
into authoritative read models:
- ParticipantProjection
- FinalizedWindows
- SessionCases
- SessionSummary
- ReportReadModel
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from observation.config import get_config
from observation.state_machine import ObservationStateMachine
from observation.case_manager import CaseManager


class ProjectionEngine:
    """Pure, deterministic state reducer engine for Chronos event streams."""

    @staticmethod
    def reduce_participant_event(state: Dict[str, Any], event: Dict[str, Any]) -> Dict[str, Any]:
        """
        Pure state accumulator for a single participant.
        (State, Event) -> NewState
        """
        state = dict(state)
        event_type = event.get("event_type")
        payload = event.get("payload") or {}
        seq = event.get("server_sequence", state.get("last_event_sequence", 0))
        if seq:
            state["last_event_sequence"] = max(state.get("last_event_sequence", 0), seq)

        if event_type == "PARTICIPANT_JOINED":
            state["observation_state"] = "OBSERVABLE"

        elif event_type == "PARTICIPANT_LEFT":
            state["observation_state"] = "LEFT"

        elif event_type == "NO_DATA_ENTERED":
            state["observation_state"] = "NO_DATA"
            tech_reasons = payload.get("technical_reasons") or [payload.get("primary_reason", "CAMERA_UNAVAILABLE")]
            state["technical_reasons"] = list(tech_reasons)
            state["no_data_start_iso"] = event.get("occurred_at")

        elif event_type == "NO_DATA_EXITED":
            state["observation_state"] = "OBSERVABLE"
            if payload.get("streak_reset"):
                state["warning_streak"] = 0
            state["no_data_start_iso"] = None

        elif event_type == "CAMERA_STATE_CHANGED":
            if not payload.get("is_usable", True):
                reason = payload.get("reason", "CAMERA_UNAVAILABLE")
                if reason and reason not in state["technical_reasons"]:
                    state["technical_reasons"].append(reason)
            else:
                state["technical_reasons"] = [
                    r for r in state["technical_reasons"]
                    if not r.startswith("CAMERA_")
                ]

        elif event_type == "NETWORK_STATE_CHANGED":
            if not payload.get("is_usable", True):
                if "NETWORK_DEGRADED" not in state["technical_reasons"]:
                    state["technical_reasons"].append("NETWORK_DEGRADED")
            else:
                state["technical_reasons"] = [
                    r for r in state["technical_reasons"]
                    if not r.startswith("NETWORK_")
                ]

        elif event_type == "WINDOW_FINALIZED":
            obs_state = payload.get("observation_state", "VALID")
            classification = payload.get("classification", "VALID_CLEAN")
            coverage = float(payload.get("coverage_ratio", 1.0))
            state["coverage_ratio"] = round(coverage, 2)

            is_demo = bool(event.get("is_demo", False))
            config = get_config(is_demo=is_demo)
            sm = ObservationStateMachine(
                config=config,
                initial_warning_streak=state.get("warning_streak", 0),
                initial_clean_streak=state.get("clean_streak", 0),
                initial_attention_pattern=state.get("attention_pattern", "UNKNOWN"),
                initial_case_state=state.get("case_state", "NONE"),
            )
            if state.get("no_data_start_iso"):
                try:
                    sm.no_data_start_time = datetime.fromisoformat(state["no_data_start_iso"].replace("Z", "+00:00"))
                except Exception:
                    sm.no_data_start_time = None

            occurred_at = event.get("occurred_at")
            eval_res = sm.evaluate_window(payload, timestamp=occurred_at)

            # Synchronize state from state machine evaluation
            if eval_res.get("observation_state") == "NO_DATA" or classification == "NOT_EVALUATED":
                state["observation_state"] = "NO_DATA"
                state["warning_streak"] = sm.warning_streak
                tech_reasons = payload.get("technical_reasons") or []
                for tr in tech_reasons:
                    if tr not in state["technical_reasons"]:
                        state["technical_reasons"].append(tr)
                if sm.no_data_start_time is None:
                    state["no_data_start_iso"] = None
                elif not state.get("no_data_start_iso") and occurred_at:
                    state["no_data_start_iso"] = occurred_at
            else:
                state["observation_state"] = "OBSERVABLE"
                state["warning_streak"] = sm.warning_streak
                state["clean_streak"] = sm.clean_streak
                state["attention_pattern"] = sm.attention_pattern
                state["case_state"] = sm.case_state
                state["no_data_start_iso"] = None

                if classification in ("VALID_WARNING", "WARNING"):
                    state["active_reason_codes"] = list(payload.get("reason_codes") or ["ORIENTATION_AWAY"])
                elif classification in ("VALID_CLEAN", "CLEAN"):
                    state["active_reason_codes"] = []

        elif event_type == "IDENTITY_RESULT":
            # INVARIANT: Identity never changes attention score or streak
            state["identity_state"] = payload.get("identity_state") or payload.get("result_state", "VERIFIED")

        elif event_type == "ACTIVE_PRESENCE_REQUESTED":
            state["active_presence_state"] = "REQUESTED"

        elif event_type == "ACTIVE_PRESENCE_STARTED":
            state["active_presence_state"] = "IN_PROGRESS"

        elif event_type == "ACTIVE_PRESENCE_PASSED":
            # INVARIANT: Active Presence pass NEVER increases engagement or attention score
            state["active_presence_state"] = "PASSED"

        elif event_type == "ACTIVE_PRESENCE_RETRY_REQUIRED":
            state["active_presence_state"] = "RETRY_REQUIRED"

        elif event_type == "ACTIVE_PRESENCE_TIMED_OUT":
            state["active_presence_state"] = "TIMED_OUT"

        elif event_type == "ACTIVE_PRESENCE_DECLINED":
            state["active_presence_state"] = "DECLINED"

        elif event_type == "ACTIVE_PRESENCE_UNAVAILABLE":
            state["active_presence_state"] = "UNAVAILABLE"

        elif event_type in ("PAGE_HIDDEN", "WINDOW_BLURRED", "FULLSCREEN_EXITED"):
            # INVARIANT: Browser visibility NEVER alters attention score
            state["browser_context"] = "PAGE_HIDDEN" if event_type == "PAGE_HIDDEN" else (
                "WINDOW_BLURRED" if event_type == "WINDOW_BLURRED" else "FULLSCREEN_EXITED"
            )

        elif event_type in ("PAGE_VISIBLE", "WINDOW_FOCUSED", "FULLSCREEN_ENTERED"):
            state["browser_context"] = "NO_ACTIVE_EVENT"

        elif event_type == "STUDENT_CONTEXT_ADDED":
            # Student context annotates evidence without erasing streaks
            state["student_context_count"] = state.get("student_context_count", 0) + 1
            if state.get("case_state") == "MONITOR":
                state["case_state"] = "CONTEXT_ADDED"

        elif event_type == "TEACHER_ACTION_RECORDED":
            state["teacher_action_count"] = state.get("teacher_action_count", 0) + 1
            action = payload.get("action") or payload.get("action_type", "")
            if str(action).lower() in ("resolve", "resolve_case", "dismiss", "mark_technical"):
                state["case_state"] = "RESOLVED"

        return state

    @classmethod
    def build_participant_projection(
        cls, events: List[Dict[str, Any]], participant_id: str, session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Reconstructs the full ParticipantProjection by deterministic fold of event stream.
        """
        initial_state: Dict[str, Any] = {
            "participant_id": participant_id,
            "session_id": session_id or (events[0].get("session_id") if events else None),
            "observation_state": "OBSERVABLE",
            "attention_pattern": "UNKNOWN",
            "identity_state": "NOT_REQUESTED",
            "active_presence_state": "NOT_REQUESTED",
            "browser_context": "NO_ACTIVE_EVENT",
            "case_state": "NONE",
            "warning_streak": 0,
            "clean_streak": 0,
            "coverage_ratio": 1.0,
            "active_reason_codes": [],
            "technical_reasons": [],
            "student_context_count": 0,
            "teacher_action_count": 0,
            "last_event_sequence": 0,
        }

        # Filter events for this participant (or session-wide events)
        user_events = [
            e for e in events
            if e.get("participant_id") == participant_id or not e.get("participant_id")
        ]
        user_events.sort(key=lambda x: (x.get("server_sequence") or 0, x.get("occurred_at") or ""))

        current_state = initial_state
        for event in user_events:
            current_state = cls.reduce_participant_event(current_state, event)

        # Cleanup internal tracking fields
        current_state.pop("no_data_start_iso", None)
        return current_state

    @classmethod
    def build_session_cases(cls, events: List[Dict[str, Any]], session_id: str) -> List[Dict[str, Any]]:
        """
        Groups repeated events into distinct teacher triage cases.
        Delegates to pure CaseManager aggregator.
        """
        return CaseManager.build_session_cases(events, session_id)

    @classmethod
    def build_session_summary(
        cls, events: List[Dict[str, Any]], session_id: str, tenant_id: str
    ) -> Dict[str, Any]:
        """
        Builds aggregate session statistics strictly from event stream replay.
        """
        participants = set()
        windows_evaluated = 0
        warning_windows = 0
        clean_windows = 0
        no_data_windows = 0

        for evt in events:
            pid = evt.get("participant_id")
            if pid:
                participants.add(pid)
            if evt.get("event_type") == "WINDOW_FINALIZED":
                windows_evaluated += 1
                clf = (evt.get("payload") or {}).get("classification", "")
                obs = (evt.get("payload") or {}).get("observation_state", "")
                if obs == "NO_DATA" or clf == "NOT_EVALUATED":
                    no_data_windows += 1
                elif clf in ("VALID_WARNING", "WARNING"):
                    warning_windows += 1
                elif clf in ("VALID_CLEAN", "CLEAN"):
                    clean_windows += 1

        avg_attention = None
        if windows_evaluated > 0 and (clean_windows + warning_windows) > 0:
            valid_total = clean_windows + warning_windows
            avg_attention = round((clean_windows / valid_total) * 100.0, 2)

        cases = cls.build_session_cases(events, session_id)
        unresolved = sum(1 for c in cases if c.get("status") in ("OPEN", "MONITOR", "ACTION_REQUIRED"))

        return {
            "session_id": session_id,
            "tenant_id": tenant_id,
            "total_participants": len(participants),
            "avg_attention_score": avg_attention,
            "total_cases": len(cases),
            "unresolved_cases": unresolved,
            "windows_evaluated": windows_evaluated,
            "warning_windows": warning_windows,
            "clean_windows": clean_windows,
            "no_data_windows": no_data_windows,
            "final_status": "ACTIVE",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
