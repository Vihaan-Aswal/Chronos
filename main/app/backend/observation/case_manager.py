"""
Chronos Case Manager & Correlated Incident Detector
Domain Subsystem: Observation & State Machine
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple, Union

from .policy_router import PolicyRouter


def _parse_iso_dt(dt_val: Optional[Union[datetime, str]]) -> datetime:
    if dt_val is None:
        return datetime.now(timezone.utc)
    if isinstance(dt_val, datetime):
        if dt_val.tzinfo is None:
            return dt_val.replace(tzinfo=timezone.utc)
        return dt_val
    try:
        dt = datetime.fromisoformat(str(dt_val).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


class CaseManager:
    """
    Pure aggregator that groups participant events into deduplicated triage cases
    and detects correlated multi-participant session incidents.
    """

    INCIDENT_WINDOW_SECONDS: float = 60.0
    MIN_INCIDENT_PARTICIPANTS: int = 3
    MIN_INCIDENT_RATIO: float = 0.20

    @classmethod
    def build_session_cases(
        cls,
        events: List[Dict[str, Any]],
        session_id: str,
        total_participants: Optional[int] = None,
        policy_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Pure state transformation of raw event list into structured teacher triage cases.
        """
        sorted_events = sorted(
            events,
            key=lambda x: (x.get("server_sequence") or 0, str(x.get("occurred_at") or ""))
        )

        cases: Dict[str, Dict[str, Any]] = {}
        distinct_pids: Set[str] = set()

        for evt in sorted_events:
            etype = evt.get("event_type", "")
            pid = evt.get("participant_id") or "session"
            if pid != "session":
                distinct_pids.add(pid)
            payload = evt.get("payload") or {}
            occurred_at = evt.get("occurred_at", datetime.now(timezone.utc).isoformat())

            # Determine category
            category = None
            if etype in ("CAMERA_STATE_CHANGED", "NO_DATA_ENTERED") and (
                "CAMERA" in str(payload) or "FACE" in str(payload) or "IMAGE" in str(payload)
            ):
                category = "TECHNICAL_CAMERA"
            elif etype == "NETWORK_STATE_CHANGED" or "NETWORK" in str(payload):
                category = "TECHNICAL_NETWORK"
            elif etype == "WINDOW_FINALIZED" and payload.get("classification") in ("VALID_WARNING", "WARNING"):
                category = "ATTENTION_CONCERN"
            elif etype == "IDENTITY_RESULT" and payload.get("identity_state") in (
                "LOW_CONFIDENCE", "QUALITY_FAIL", "MISMATCH", "UNAVAILABLE"
            ):
                category = "IDENTITY_UNCERTAINTY"
            elif etype in ("PAGE_HIDDEN", "WINDOW_BLURRED") and payload.get("duration_ms", 0) >= 60000:
                category = "BROWSER_VISIBILITY"
            elif etype == "STUDENT_CONTEXT_ADDED" and payload.get("requested_help"):
                category = "STUDENT_HELP_REQUEST"

            if category:
                case_key = f"{pid}:{category}"
                evt_id = evt.get("event_id")
                if case_key not in cases:
                    short_pid = pid[:8] if len(pid) > 8 else pid
                    cases[case_key] = {
                        "case_id": f"case-{short_pid}-{category.lower()}",
                        "session_id": session_id,
                        "participant_id": None if pid == "session" else pid,
                        "category": category,
                        "started_at": occurred_at,
                        "last_updated_at": occurred_at,
                        "duration_ms": 0,
                        "status": "OPEN",
                        "priority": "ACTION_REQUIRED" if category == "ATTENTION_CONCERN" else "MONITOR",
                        "event_ids": [evt_id] if evt_id else [],
                        "self_recovery_attempted": False,
                        "student_context_count": 0,
                        "teacher_action_count": 0,
                    }
                else:
                    c = cases[case_key]
                    if evt_id and evt_id not in c["event_ids"]:
                        c["event_ids"].append(evt_id)
                    c["last_updated_at"] = occurred_at

            # Self-recovery resolution
            if etype == "WINDOW_FINALIZED" and payload.get("classification") in ("VALID_CLEAN", "CLEAN"):
                att_key = f"{pid}:ATTENTION_CONCERN"
                if att_key in cases and payload.get("clean_streak", 0) >= 2:
                    cases[att_key]["status"] = "RESOLVED"
                    cases[att_key]["self_recovery_attempted"] = True

            # Student context annotation
            if etype == "STUDENT_CONTEXT_ADDED":
                for c in cases.values():
                    if c.get("participant_id") == pid:
                        c["student_context_count"] = c.get("student_context_count", 0) + 1

            # Teacher action resolution
            if etype == "TEACHER_ACTION_RECORDED":
                target_cases = payload.get("target_case_ids") or []
                target_pids = payload.get("target_participant_ids") or []
                action = str(payload.get("action") or payload.get("action_type", "")).lower()

                for c in cases.values():
                    matches_case = c.get("case_id") in target_cases
                    matches_pid = c.get("participant_id") in target_pids
                    if matches_case or matches_pid:
                        c["teacher_action_count"] = c.get("teacher_action_count", 0) + 1
                        if action in ("resolve", "resolve_case", "dismiss", "mark_technical"):
                            c["status"] = "RESOLVED"
                        elif action == "snooze":
                            c["status"] = "SNOOZED"

        # Apply policy routing if requested
        result_cases: List[Dict[str, Any]] = []
        for c in cases.values():
            cat = c.get("category")
            if policy_id and cat in ("ATTENTION_CONCERN", "BROWSER_VISIBILITY"):
                routed = PolicyRouter.route_attention_case(c, policy_id)
                if routed:
                    result_cases.append(routed)
            elif policy_id and PolicyRouter.normalize_policy_id(policy_id) == "NO_ANALYTICS" and cat in ("ATTENTION_CONCERN", "BROWSER_VISIBILITY"):
                continue
            else:
                result_cases.append(c)

        # Detect correlated session incidents
        num_session_pids = total_participants or len(distinct_pids)
        incidents = cls.detect_session_incidents(sorted_events, session_id, num_session_pids)
        result_cases.extend(incidents)

        return result_cases

    @classmethod
    def detect_session_incidents(
        cls,
        events: List[Dict[str, Any]],
        session_id: str,
        total_participants: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Detects correlated multi-student technical incidents within a 60-second sliding window.
        Triggers when >= 3 participants (or >= 20% of session) experience technical issues.
        """
        technical_records: List[Tuple[datetime, str, str]] = []  # (dt, pid, event_id)

        for evt in events:
            etype = evt.get("event_type", "")
            pid = evt.get("participant_id")
            if not pid:
                continue

            payload = evt.get("payload") or {}
            is_tech = False
            if etype in ("CAMERA_STATE_CHANGED", "NO_DATA_ENTERED"):
                if not payload.get("is_usable", True) or any(
                    k in str(payload) for k in ("CAMERA", "UNAVAILABLE", "POOR_QUALITY", "NO_FACE")
                ):
                    is_tech = True
            elif etype == "NETWORK_STATE_CHANGED":
                if not payload.get("is_usable", True) or "NETWORK" in str(payload):
                    is_tech = True

            if is_tech:
                dt = _parse_iso_dt(evt.get("occurred_at"))
                evt_id = evt.get("event_id") or ""
                technical_records.append((dt, pid, evt_id))

        if not technical_records:
            return []

        technical_records.sort(key=lambda x: x[0])
        incidents: List[Dict[str, Any]] = []
        cluster_window = timedelta(seconds=cls.INCIDENT_WINDOW_SECONDS)

        # Sliding window evaluation
        n = len(technical_records)
        i = 0
        seen_incident_events: Set[str] = set()

        while i < n:
            start_dt, start_pid, start_eid = technical_records[i]
            window_pids: Set[str] = {start_pid}
            window_events: List[str] = [start_eid] if start_eid else []
            latest_dt = start_dt

            j = i + 1
            while j < n and (technical_records[j][0] - start_dt) <= cluster_window:
                cur_dt, cur_pid, cur_eid = technical_records[j]
                window_pids.add(cur_pid)
                if cur_eid and cur_eid not in window_events:
                    window_events.append(cur_eid)
                latest_dt = cur_dt
                j += 1

            count = len(window_pids)
            qualifies = count >= cls.MIN_INCIDENT_PARTICIPANTS
            if not qualifies and total_participants > 0 and count >= 2:
                if (count / total_participants) >= cls.MIN_INCIDENT_RATIO:
                    qualifies = True

            if qualifies:
                new_events = [e for e in window_events if e not in seen_incident_events]
                if new_events:
                    seen_incident_events.update(new_events)
                    short_sid = session_id[:8] if len(session_id) > 8 else session_id
                    incidents.append({
                        "case_id": f"case-session-{short_sid}-incident-{len(incidents)+1}",
                        "session_id": session_id,
                        "participant_id": None,
                        "category": "SESSION_INCIDENT",
                        "started_at": start_dt.isoformat(),
                        "last_updated_at": latest_dt.isoformat(),
                        "duration_ms": int((latest_dt - start_dt).total_seconds() * 1000),
                        "status": "OPEN",
                        "priority": "URGENT",
                        "event_ids": window_events,
                        "self_recovery_attempted": False,
                        "student_context_count": 0,
                        "teacher_action_count": 0,
                        "affected_participant_count": count,
                    })
                i = j  # Move past clustered window
            else:
                i += 1

        return incidents
