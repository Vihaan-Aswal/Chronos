"""
Chronos Pure Authoritative Report Engine
Workstream W8: Timeline-Led Reports and Exports
Specification: HACKATHON_PRD.md, LOGIC_AND_EVENT_SPEC.md, PRIVACY_DATA_MODEL.md
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from reports.schemas import (
    ReportReadModel,
    SessionOverview,
    ObservationCoverageSummary,
    TechnicalUncertaintySummary,
    AttentionPatternSummary,
    IdentityOutcomesSummary,
    ActivePresenceSummary,
    BrowserVisibilitySummary,
    ResourceUsageSummary,
    AnswerSubmissionsSummary,
    StudentContextSummary,
    TeacherActionsSummary,
    RecoveryOutcomesSummary,
    ReviewPrioritizationItem,
    ReviewPriorityLevel,
    ParticipantDrilldown,
    EventReconciliation,
)
from projections.engine import ProjectionEngine
from observation.case_manager import CaseManager


class ReportEngine:
    """
    Authoritative server-side report generator.
    Reconstructs comprehensive, evidence-led report read models strictly from durable events.
    """

    @classmethod
    def build_report_read_model(
        cls,
        session: Dict[str, Any],
        events: List[Dict[str, Any]],
        resources: Optional[List[Dict[str, Any]]] = None,
        submissions: Optional[List[Dict[str, Any]]] = None,
    ) -> ReportReadModel:
        session_id = session.get("session_id") or session.get("id") or "unknown-session"
        tenant_id = session.get("tenant_id") or "default-tenant"
        teacher_id = session.get("teacher_id") or session.get("created_by") or "unknown-teacher"
        title = session.get("title") or f"Session {session_id[:8]}"
        policy_id = session.get("policy_id") or "CLASSROOM"
        policy_version = session.get("policy_version") or "v1"
        policy_snapshot = session.get("policy_snapshot") or {}
        model_versions = session.get("model_versions") or {}
        is_demo = bool(session.get("is_demo", False))
        session_status = session.get("status") or "ENDED"

        is_no_analytics = policy_id == "NO_ANALYTICS"

        # 1. Sort events deterministically
        sorted_events = sorted(
            events,
            key=lambda e: (
                e.get("server_sequence") if e.get("server_sequence") is not None else 0,
                e.get("occurred_at") or "",
            ),
        )

        # 2. Event Reconciliation Table
        event_counts: Dict[str, int] = {}
        for evt in sorted_events:
            etype = evt.get("event_type", "UNKNOWN")
            event_counts[etype] = event_counts.get(etype, 0) + 1

        reconciliation = EventReconciliation(
            total_events_processed=len(sorted_events),
            counts_by_event_type=event_counts,
            reconciliation_verified=True,
            discrepancy_note=None,
        )

        # 3. Session Timing & Participant Roster
        start_time_iso = session.get("start_time") or session.get("started_at")
        end_time_iso = session.get("end_time") or session.get("ended_at")

        participant_ids: set[str] = set()
        simulated_pids: set[str] = set()

        for evt in sorted_events:
            pid = evt.get("participant_id")
            if pid:
                participant_ids.add(pid)
                if evt.get("is_demo"):
                    simulated_pids.add(pid)
            if evt.get("event_type") == "SESSION_STARTED" and not start_time_iso:
                start_time_iso = evt.get("occurred_at")
            elif evt.get("event_type") == "SESSION_ENDED":
                end_time_iso = evt.get("occurred_at")

        if not start_time_iso and sorted_events:
            start_time_iso = sorted_events[0].get("occurred_at")
        if not end_time_iso and sorted_events:
            end_time_iso = sorted_events[-1].get("occurred_at")

        duration_sec = 0.0
        if start_time_iso and end_time_iso:
            try:
                st = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
                et = datetime.fromisoformat(end_time_iso.replace("Z", "+00:00"))
                duration_sec = max(0.0, (et - st).total_seconds())
            except Exception:
                duration_sec = 0.0

        duration_min = round(duration_sec / 60.0, 2)
        total_parts = len(participant_ids)
        sim_parts = len(simulated_pids)
        live_parts = total_parts - sim_parts

        overview = SessionOverview(
            session_id=session_id,
            tenant_id=tenant_id,
            teacher_id=teacher_id,
            title=title,
            policy_id=policy_id,
            policy_version=policy_version,
            policy_snapshot=policy_snapshot,
            model_versions=model_versions,
            is_demo=is_demo,
            start_time=start_time_iso,
            end_time=end_time_iso,
            duration_seconds=duration_sec,
            duration_minutes=duration_min,
            total_participants=total_parts,
            live_participants_count=live_parts,
            simulated_participants_count=sim_parts,
            session_status=session_status,
        )

        # 4. Observation Coverage & Window Finalizations
        total_expected_windows = 0
        total_eval_windows = 0
        valid_clean = 0
        valid_warning = 0
        no_data_win = 0
        total_usable_seg = 0
        total_expected_seg = 0

        window_events: List[Dict[str, Any]] = []
        attention_timeline: List[Dict[str, Any]] = []
        cue_exposure_total = 0.0

        for evt in sorted_events:
            if evt.get("event_type") == "WINDOW_FINALIZED":
                payload = evt.get("payload") or {}
                window_events.append(evt)
                total_eval_windows += 1
                exp_seg = payload.get("expected_segments", 12 if not is_demo else 10)
                use_seg = payload.get("usable_segments", 0)
                total_expected_seg += exp_seg
                total_usable_seg += use_seg

                obs_st = payload.get("observation_state", "VALID")
                clf = payload.get("classification", "VALID_CLEAN")
                cue_exp = float(payload.get("cue_exposure_seconds", 0.0))
                cue_exposure_total += cue_exp

                if obs_st == "NO_DATA" or clf == "NOT_EVALUATED":
                    no_data_win += 1
                elif clf in ("VALID_WARNING", "WARNING"):
                    valid_warning += 1
                elif clf in ("VALID_CLEAN", "CLEAN"):
                    valid_clean += 1

                attention_timeline.append({
                    "window_id": payload.get("window_id"),
                    "participant_id": evt.get("participant_id"),
                    "occurred_at": evt.get("occurred_at"),
                    "observation_state": obs_st,
                    "classification": clf,
                    "coverage_ratio": payload.get("coverage_ratio", 1.0),
                    "cue_exposure_seconds": cue_exp,
                    "warning_streak": payload.get("warning_streak", 0),
                    "clean_streak": payload.get("clean_streak", 0),
                    "reason_codes": payload.get("reason_codes", []),
                    "technical_reasons": payload.get("technical_reasons", []),
                })

        total_expected_windows = total_eval_windows
        overall_coverage = (
            round(total_usable_seg / max(total_expected_seg, 1), 2)
            if total_expected_seg > 0
            else 1.0
        )

        coverage_summary = ObservationCoverageSummary(
            total_expected_windows=total_expected_windows,
            total_evaluated_windows=total_eval_windows,
            valid_clean_windows=valid_clean,
            valid_warning_windows=valid_warning,
            no_data_windows=no_data_win,
            overall_coverage_ratio=overall_coverage,
            total_usable_segments=total_usable_seg,
            total_expected_segments=total_expected_seg,
            is_sufficient_for_interpretation=overall_coverage >= 0.75 or total_eval_windows == 0,
        )

        # 5. Technical Uncertainty & NO_DATA Breakdown
        tech_reasons_count: Dict[str, int] = {}
        tech_episodes: List[Dict[str, Any]] = []
        affected_tech_pids: set[str] = set()
        total_no_data_sec = 0.0
        cam_unavail_sec = 0.0
        net_degraded_sec = 0.0
        qual_insuff_sec = 0.0

        for evt in sorted_events:
            etype = evt.get("event_type")
            payload = evt.get("payload") or {}
            pid = evt.get("participant_id")

            if etype == "NO_DATA_ENTERED":
                if pid:
                    affected_tech_pids.add(pid)
                reasons = payload.get("technical_reasons") or [payload.get("primary_reason", "CAMERA_UNAVAILABLE")]
                for r in reasons:
                    tech_reasons_count[r] = tech_reasons_count.get(r, 0) + 1
                tech_episodes.append({
                    "type": "NO_DATA_ENTERED",
                    "participant_id": pid,
                    "started_at": payload.get("started_at") or evt.get("occurred_at"),
                    "reasons": reasons,
                })

            elif etype == "NO_DATA_EXITED":
                dur_ms = payload.get("duration_ms", 0)
                dur_s = dur_ms / 1000.0
                total_no_data_sec += dur_s
                tech_episodes.append({
                    "type": "NO_DATA_EXITED",
                    "participant_id": pid,
                    "ended_at": payload.get("ended_at") or evt.get("occurred_at"),
                    "duration_sec": dur_s,
                    "exit_reason": payload.get("exit_reason"),
                })

            elif etype == "CAMERA_STATE_CHANGED" and not payload.get("is_usable", True):
                if pid:
                    affected_tech_pids.add(pid)
                r = payload.get("reason", "CAMERA_UNAVAILABLE")
                tech_reasons_count[r] = tech_reasons_count.get(r, 0) + 1

            elif etype == "NETWORK_STATE_CHANGED" and not payload.get("is_usable", True):
                if pid:
                    affected_tech_pids.add(pid)
                tech_reasons_count["NETWORK_DEGRADED"] = tech_reasons_count.get("NETWORK_DEGRADED", 0) + 1

            elif etype == "WINDOW_FINALIZED":
                for tr in payload.get("technical_reasons") or []:
                    tech_reasons_count[tr] = tech_reasons_count.get(tr, 0) + 1
                    if pid:
                        affected_tech_pids.add(pid)

        for r, cnt in tech_reasons_count.items():
            est_sec = cnt * (5.0 if not is_demo else 1.0)
            if "CAMERA" in r or "NO_FACE" in r:
                cam_unavail_sec += est_sec
            elif "NETWORK" in r:
                net_degraded_sec += est_sec
            elif "QUALITY" in r or "LOW_CONFIDENCE" in r:
                qual_insuff_sec += est_sec

        tech_uncertainty = TechnicalUncertaintySummary(
            total_no_data_duration_sec=total_no_data_sec,
            affected_participant_count=len(affected_tech_pids),
            reason_counts=tech_reasons_count,
            technical_episodes=tech_episodes,
            camera_unavailable_sec=cam_unavail_sec,
            network_degraded_sec=net_degraded_sec,
            quality_insufficient_sec=qual_insuff_sec,
        )

        # 6. Attention Patterns
        pat_dist = {"STABLE": 0, "VARIABLE": 0, "SUSTAINED_CONCERN": 0, "UNKNOWN": 0}
        per_part_projections: Dict[str, Dict[str, Any]] = {}

        for pid in participant_ids:
            proj = ProjectionEngine.build_participant_projection(sorted_events, pid, session_id)
            per_part_projections[pid] = proj
            pat = proj.get("attention_pattern", "UNKNOWN")
            if pat in pat_dist:
                pat_dist[pat] += 1
            else:
                pat_dist["UNKNOWN"] += 1

        attention_summary = AttentionPatternSummary(
            distribution=pat_dist,
            total_valid_windows=valid_clean + valid_warning,
            valid_clean_windows=valid_clean,
            valid_warning_windows=valid_warning,
            cue_exposure_seconds_total=cue_exposure_total,
            attention_timeline=attention_timeline,
        )

        # 7. Identity Outcomes Summary
        id_breakdown = {
            "NOT_REQUESTED": 0,
            "UNENROLLED": 0,
            "CHECKING": 0,
            "VERIFIED": 0,
            "LOW_CONFIDENCE": 0,
            "QUALITY_FAIL": 0,
            "MISMATCH": 0,
            "UNAVAILABLE": 0,
            "MANUAL_REVIEW": 0,
        }
        total_id_checks = 0
        alt_verif_count = 0
        id_review_pids: set[str] = set()

        for evt in sorted_events:
            if evt.get("event_type") == "IDENTITY_RESULT":
                total_id_checks += 1
                payload = evt.get("payload") or {}
                st = payload.get("identity_state") or payload.get("result_state", "VERIFIED")
                if st in id_breakdown:
                    id_breakdown[st] += 1
                else:
                    id_breakdown["VERIFIED"] += 1
                if payload.get("alternative_verification_used"):
                    alt_verif_count += 1
                if st in ("MISMATCH", "MANUAL_REVIEW", "LOW_CONFIDENCE", "UNAVAILABLE", "QUALITY_FAIL"):
                    pid = evt.get("participant_id")
                    if pid:
                        id_review_pids.add(pid)


        if total_id_checks == 0:
            id_breakdown["NOT_REQUESTED"] = len(participant_ids)

        identity_summary = IdentityOutcomesSummary(
            total_checks=total_id_checks,
            outcomes_breakdown=id_breakdown,
            alternative_verifications_count=alt_verif_count,
            participants_requiring_review=sorted(list(id_review_pids)),
        )

        # 8. Active Presence Challenges Summary
        ap_challenges: List[Dict[str, Any]] = []
        ap_counts = {
            "PASSED": 0,
            "QUALITY_FAIL": 0,
            "TIMED_OUT": 0,
            "DECLINED": 0,
            "UNAVAILABLE": 0,
            "RETRY_REQUIRED": 0,
            "MANUAL_REVIEW": 0,
        }
        ap_durations: List[int] = []
        distinct_challenge_ids: set[str] = set()
        challenges_issued_count = 0

        for evt in sorted_events:
            etype = evt.get("event_type")
            payload = evt.get("payload") or {}
            if etype and etype.startswith("ACTIVE_PRESENCE_"):
                cid = payload.get("challenge_id")
                if cid:
                    distinct_challenge_ids.add(cid)
                if etype == "ACTIVE_PRESENCE_CHALLENGE_ISSUED":
                    challenges_issued_count += 1
                else:
                    sub_state = etype.replace("ACTIVE_PRESENCE_", "")
                    if sub_state in ap_counts:
                        ap_counts[sub_state] += 1
                    if sub_state == "PASSED" and payload.get("elapsed_ms"):
                        ap_durations.append(payload["elapsed_ms"])

                ap_challenges.append({
                    "event_type": etype,
                    "participant_id": evt.get("participant_id"),
                    "challenge_id": cid,
                    "occurred_at": evt.get("occurred_at"),
                    "attempt_number": payload.get("attempt_number", 1),
                    "status": payload.get("status") or etype.replace("ACTIVE_PRESENCE_", ""),
                    "failure_reason": payload.get("failure_reason"),
                })

        total_issued = challenges_issued_count if challenges_issued_count > 0 else (len(distinct_challenge_ids) if distinct_challenge_ids else len(ap_challenges))
        avg_ap_ms = round(sum(ap_durations) / len(ap_durations), 1) if ap_durations else None

        active_presence_summary = ActivePresenceSummary(
            total_challenges_issued=total_issued,
            passed_count=ap_counts["PASSED"],

            quality_fail_count=ap_counts["QUALITY_FAIL"],
            timed_out_count=ap_counts["TIMED_OUT"],
            declined_count=ap_counts["DECLINED"],
            unavailable_count=ap_counts["UNAVAILABLE"],
            retry_required_count=ap_counts["RETRY_REQUIRED"],
            manual_review_count=ap_counts["MANUAL_REVIEW"],
            average_completion_ms=avg_ap_ms,
            challenges=ap_challenges,
        )

        # 9. Browser Visibility & Intervals
        browser_intervals: List[Dict[str, Any]] = []
        total_browser_dur_ms = 0
        declared_assoc_count = 0

        active_hide_starts: Dict[str, Dict[str, Any]] = {}
        for evt in sorted_events:
            etype = evt.get("event_type")
            pid = evt.get("participant_id") or "session"
            payload = evt.get("payload") or {}
            occ = evt.get("occurred_at")

            if etype in ("PAGE_HIDDEN", "WINDOW_BLURRED", "FULLSCREEN_EXITED"):
                active_hide_starts[pid] = {
                    "event_type": etype,
                    "started_at": payload.get("started_at") or occ,
                    "declared_resource_opened_recently": payload.get("declared_resource_opened_recently", False),
                    "associated_resource_id": payload.get("associated_declared_resource_id"),
                }

            elif etype in ("PAGE_VISIBLE", "WINDOW_FOCUSED", "FULLSCREEN_ENTERED") and pid in active_hide_starts:
                st_info = active_hide_starts.pop(pid)
                start_iso = st_info["started_at"]
                end_iso = payload.get("ended_at") or occ
                dur_ms = payload.get("duration_ms")
                if dur_ms is None and start_iso and end_iso:
                    try:
                        s_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
                        e_dt = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
                        dur_ms = max(0, int((e_dt - s_dt).total_seconds() * 1000))
                    except Exception:
                        dur_ms = 0
                dur_ms = dur_ms or 0
                total_browser_dur_ms += dur_ms
                if st_info.get("declared_resource_opened_recently"):
                    declared_assoc_count += 1

                browser_intervals.append({
                    "participant_id": pid,
                    "event_type": st_info["event_type"],
                    "started_at": start_iso,
                    "ended_at": end_iso,
                    "duration_ms": dur_ms,
                    "duration_seconds": round(dur_ms / 1000.0, 1),
                    "destination_known": False,
                    "declared_resource_opened_recently": st_info.get("declared_resource_opened_recently", False),
                    "context_note": (
                        "Declared resource was opened shortly beforehand. Destination cannot be verified."
                        if st_info.get("declared_resource_opened_recently")
                        else "Destination cannot be verified."
                    ),
                })

        for pid, st_info in active_hide_starts.items():
            start_iso = st_info["started_at"]
            end_iso = end_time_iso or start_iso
            dur_ms = 0
            try:
                s_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
                e_dt = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
                dur_ms = max(0, int((e_dt - s_dt).total_seconds() * 1000))
            except Exception:
                dur_ms = 0
            total_browser_dur_ms += dur_ms
            browser_intervals.append({
                "participant_id": pid,
                "event_type": st_info["event_type"],
                "started_at": start_iso,
                "ended_at": end_iso,
                "duration_ms": dur_ms,
                "duration_seconds": round(dur_ms / 1000.0, 1),
                "destination_known": False,
                "declared_resource_opened_recently": st_info.get("declared_resource_opened_recently", False),
                "context_note": "Destination cannot be verified.",
            })

        browser_visibility_summary = BrowserVisibilitySummary(
            total_intervals=len(browser_intervals),
            total_duration_sec=round(total_browser_dur_ms / 1000.0, 1),
            destination_known=False,
            destination_unverified_notice=(
                "Browser visibility measures page focus/blur transitions only. "
                "Chronos does not monitor URLs or track external browser activity."
            ),
            declared_resource_associated_count=declared_assoc_count,
            intervals=browser_intervals,
        )

        # 10. Resource Usage Summary
        res_list = list(resources or [])
        primary_paper = None
        supplementary_res: List[Dict[str, Any]] = []
        declared_links: List[Dict[str, Any]] = []
        access_events: List[Dict[str, Any]] = []

        for r in res_list:
            rtype = r.get("type") or r.get("resource_type", "")
            is_prim = bool(r.get("is_primary") or r.get("required") and rtype == "uploaded_pdf")
            if is_prim and not primary_paper:
                primary_paper = r
            elif rtype == "external_link":
                declared_links.append(r)
            else:
                supplementary_res.append(r)

        for evt in sorted_events:
            etype = evt.get("event_type")
            if etype in ("RESOURCE_OPENED", "RESOURCE_CLOSED", "EXTERNAL_RESOURCE_CLICKED", "RESOURCE_PUBLISHED"):
                access_events.append({
                    "event_type": etype,
                    "participant_id": evt.get("participant_id"),
                    "occurred_at": evt.get("occurred_at"),
                    "resource_id": (evt.get("payload") or {}).get("resource_id"),
                    "title": (evt.get("payload") or {}).get("title"),
                    "duration_ms": (evt.get("payload") or {}).get("duration_ms"),
                })

        resource_usage_summary = ResourceUsageSummary(
            primary_question_paper=primary_paper,
            supplementary_resources=supplementary_res,
            declared_external_links=declared_links,
            total_access_events=len(access_events),
            access_timeline=access_events,
        )

        # 11. Answer Submissions Summary
        subs_list = list(submissions or [])
        sub_map: Dict[str, Dict[str, Any]] = {}
        for s in subs_list:
            sub_id = s.get("answer_id") or s.get("submission_id") or str(uuid.uuid4())
            sub_map[sub_id] = s

        for evt in sorted_events:
            etype = evt.get("event_type")
            if etype in ("ANSWER_DRAFT_SAVED", "ANSWER_SUBMITTED", "ANSWER_REPLACED", "ANSWER_MARKED_LATE"):
                payload = evt.get("payload") or {}
                sid = payload.get("submission_id") or payload.get("answer_id") or str(uuid.uuid4())
                sub_map[sid] = {
                    "answer_id": sid,
                    "participant_id": evt.get("participant_id"),
                    "version": payload.get("version", 1),
                    "status": "LATE" if etype == "ANSWER_MARKED_LATE" else payload.get("status", "SUBMITTED"),
                    "artifact_type": payload.get("artifact_type", "pdf_upload"),
                    "content_hash": payload.get("content_hash"),
                    "byte_size": payload.get("byte_size") or payload.get("size_bytes"),
                    "submitted_at": payload.get("submitted_at") or evt.get("occurred_at"),
                    "is_late": bool(payload.get("is_late") or etype == "ANSWER_MARKED_LATE"),
                }

        all_subs = list(sub_map.values())
        draft_cnt = sum(1 for s in all_subs if s.get("status") == "DRAFT")
        final_cnt = sum(1 for s in all_subs if s.get("status") == "SUBMITTED")
        rep_cnt = sum(1 for s in all_subs if s.get("status") == "REPLACED")
        late_cnt = sum(1 for s in all_subs if s.get("is_late") or s.get("status") == "LATE")

        answer_submissions_summary = AnswerSubmissionsSummary(
            total_submissions=len(all_subs),
            draft_count=draft_cnt,
            final_submitted_count=final_cnt,
            replaced_count=rep_cnt,
            late_count=late_cnt,
            submissions=all_subs,
        )

        # 12. Student Context & Appeals
        context_entries: List[Dict[str, Any]] = []
        appeal_cat_counts: Dict[str, int] = {}
        help_req_count = 0

        for evt in sorted_events:
            if evt.get("event_type") == "STUDENT_CONTEXT_ADDED":
                payload = evt.get("payload") or {}
                cat = payload.get("appeal_category", "OTHER")
                appeal_cat_counts[cat] = appeal_cat_counts.get(cat, 0) + 1
                if payload.get("requested_help"):
                    help_req_count += 1
                context_entries.append({
                    "context_id": payload.get("context_id"),
                    "participant_id": evt.get("participant_id"),
                    "occurred_at": evt.get("occurred_at"),
                    "appeal_category": cat,
                    "explanation_text": payload.get("explanation_text"),
                    "requested_help": payload.get("requested_help", False),
                    "attached_to_event_ids": payload.get("attached_to_event_ids", []),
                })

        student_context_summary = StudentContextSummary(
            total_appeals=len(context_entries),
            category_counts=appeal_cat_counts,
            help_requests_count=help_req_count,
            context_entries=context_entries,
        )

        # 13. Teacher Actions Ledger
        actions_log: List[Dict[str, Any]] = []
        action_type_counts: Dict[str, int] = {}
        batch_cnt = 0

        for evt in sorted_events:
            if evt.get("event_type") == "TEACHER_ACTION_RECORDED":
                payload = evt.get("payload") or {}
                atype = payload.get("action_type") or payload.get("action", "RESOLVE")
                action_type_counts[atype] = action_type_counts.get(atype, 0) + 1
                if payload.get("is_batch"):
                    batch_cnt += 1
                actions_log.append({
                    "action_id": payload.get("action_id"),
                    "actor_id": evt.get("actor_id"),
                    "occurred_at": evt.get("occurred_at"),
                    "action_type": atype,
                    "target_participant_ids": payload.get("target_participant_ids", []),
                    "target_case_ids": payload.get("target_case_ids", []),
                    "is_batch": payload.get("is_batch", False),
                    "note": payload.get("note"),
                    "snooze_duration_minutes": payload.get("snooze_duration_minutes"),
                })

        teacher_actions_summary = TeacherActionsSummary(
            total_actions_recorded=len(actions_log),
            action_type_counts=action_type_counts,
            batch_action_count=batch_cnt,
            actions_log=actions_log,
        )

        # 14. Recovery Outcomes & Grouped Cases
        session_cases = CaseManager.build_session_cases(sorted_events, session_id)
        self_resolved_cnt = sum(1 for c in session_cases if c.get("status") == "SELF_RECOVERED")
        teacher_resolved_cnt = sum(1 for c in session_cases if c.get("status") in ("RESOLVED", "DISMISSED"))
        unresolved_cnt = sum(1 for c in session_cases if c.get("status") in ("OPEN", "MONITOR", "ACTION_REQUIRED"))
        total_cases = len(session_cases)

        recovery_rate = (
            round((self_resolved_cnt / total_cases) * 100.0, 1)
            if total_cases > 0
            else 100.0
        )

        recovery_summary = RecoveryOutcomesSummary(
            total_cases_created=total_cases,
            self_resolved_cases_count=self_resolved_cnt,
            teacher_resolved_cases_count=teacher_resolved_cnt,
            unresolved_cases_count=unresolved_cnt,
            self_recovery_rate_pct=recovery_rate,
            average_recovery_duration_sec=None,
        )

        # 15. Review Prioritization (Evidence-Led Ranking)
        review_items: List[ReviewPrioritizationItem] = []

        for pid in sorted(list(participant_ids)):
            proj = per_part_projections.get(pid, {})
            is_sim = pid in simulated_pids
            disp_name = f"Learner {pid[:8]}" if not is_sim else f"Simulated Learner {pid[:8]}"
            w_streak = proj.get("warning_streak", 0)
            c_streak = proj.get("clean_streak", 0)
            cov_rat = proj.get("coverage_ratio", 1.0)
            id_st = proj.get("identity_state", "NOT_REQUESTED")
            ap_st = proj.get("active_presence_state", "NOT_REQUESTED")
            case_st = proj.get("case_state", "NONE")
            tech_rs = proj.get("technical_reasons", [])
            ctx_cnt = proj.get("student_context_count", 0)
            act_cnt = proj.get("teacher_action_count", 0)

            p_cases = [c for c in session_cases if c.get("participant_id") == pid]
            active_p_cases = [c for c in p_cases if c.get("status") in ("OPEN", "MONITOR", "ACTION_REQUIRED")]
            has_act_case = len(active_p_cases) > 0
            act_case_id = active_p_cases[0].get("case_id") if has_act_case else None

            evidence_reasons: List[str] = []
            priority = ReviewPriorityLevel.STABLE
            primary_cat = "GENERAL"

            if w_streak >= 3:
                priority = ReviewPriorityLevel.ACTION_REQUIRED
                primary_cat = "ATTENTION_CONCERN"
                evidence_reasons.append(
                    f"Sustained cue exposure across {w_streak} consecutive observation windows."
                )
            elif w_streak >= 2:
                if priority != ReviewPriorityLevel.ACTION_REQUIRED:
                    priority = ReviewPriorityLevel.MONITOR
                primary_cat = "ATTENTION_CONCERN"
                evidence_reasons.append(
                    f"Repeated cue exposure across {w_streak} consecutive observation windows."
                )
            elif w_streak == 1:
                if priority not in (ReviewPriorityLevel.ACTION_REQUIRED, ReviewPriorityLevel.MONITOR):
                    priority = ReviewPriorityLevel.MONITOR
                evidence_reasons.append("Brief orientation shift during 1 observation window.")

            if id_st in ("MISMATCH", "MANUAL_REVIEW"):
                priority = ReviewPriorityLevel.ACTION_REQUIRED
                primary_cat = "IDENTITY_UNCERTAINTY"
                evidence_reasons.append(f"Identity continuity status: {id_st} requiring verification.")
            elif id_st in ("LOW_CONFIDENCE", "QUALITY_FAIL", "UNAVAILABLE"):
                if priority != ReviewPriorityLevel.ACTION_REQUIRED:
                    priority = ReviewPriorityLevel.TECHNICAL_REVIEW
                primary_cat = "IDENTITY_UNCERTAINTY"
                evidence_reasons.append(f"Identity check: {id_st} (camera quality or lighting factor).")

            if ap_st in ("TIMED_OUT", "DECLINED", "MANUAL_REVIEW"):
                if priority != ReviewPriorityLevel.ACTION_REQUIRED:
                    priority = ReviewPriorityLevel.MONITOR
                evidence_reasons.append(f"Active Presence result: {ap_st}.")

            if cov_rat < 0.75 or tech_rs:
                if priority not in (ReviewPriorityLevel.ACTION_REQUIRED, ReviewPriorityLevel.MONITOR):
                    priority = ReviewPriorityLevel.TECHNICAL_REVIEW
                primary_cat = "TECHNICAL_UNCERTAINTY"
                reasons_str = ", ".join(tech_rs) if tech_rs else "Observation interrupted"
                evidence_reasons.append(f"Technical uncertainty ({reasons_str}), coverage: {int(cov_rat * 100)}%.")

            p_context = [ctx for ctx in context_entries if ctx.get("participant_id") == pid]
            for ctx in p_context:
                if ctx.get("requested_help"):
                    priority = ReviewPriorityLevel.ACTION_REQUIRED
                    primary_cat = "STUDENT_HELP_REQUEST"
                    evidence_reasons.append("Student explicitly requested teacher assistance.")
                else:
                    if priority == ReviewPriorityLevel.STABLE:
                        priority = ReviewPriorityLevel.CONTEXT_REVIEW
                    evidence_reasons.append(f"Student added context: {ctx.get('appeal_category')}.")

            if has_act_case and priority == ReviewPriorityLevel.STABLE:
                priority = ReviewPriorityLevel.MONITOR

            if not evidence_reasons:
                evidence_reasons.append("Stable observation with no active review cues.")

            review_items.append(
                ReviewPrioritizationItem(
                    participant_id=pid,
                    display_name=disp_name,
                    priority_level=priority,
                    primary_category=primary_cat,
                    evidence_reasons=evidence_reasons,
                    warning_streak=w_streak,
                    clean_streak=c_streak,
                    coverage_ratio=cov_rat,
                    no_data_duration_sec=total_no_data_sec,
                    identity_state=id_st,
                    active_presence_state=ap_st,
                    student_context_count=ctx_cnt,
                    teacher_action_count=act_cnt,
                    has_active_case=has_act_case,
                    active_case_id=act_case_id,
                )
            )

        priority_rank = {
            ReviewPriorityLevel.ACTION_REQUIRED: 0,
            ReviewPriorityLevel.MONITOR: 1,
            ReviewPriorityLevel.TECHNICAL_REVIEW: 2,
            ReviewPriorityLevel.CONTEXT_REVIEW: 3,
            ReviewPriorityLevel.RESOLVED: 4,
            ReviewPriorityLevel.STABLE: 5,
        }
        review_items.sort(key=lambda r: (priority_rank.get(r.priority_level, 99), r.participant_id))

        # 16. Participant Drilldowns Dossier
        drilldowns: Dict[str, ParticipantDrilldown] = {}
        for pid in participant_ids:
            proj = per_part_projections.get(pid, {})
            p_windows = [w for w in attention_timeline if w.get("participant_id") == pid]
            p_browser = [b for b in browser_intervals if b.get("participant_id") == pid]
            p_presence = [p for p in ap_challenges if p.get("participant_id") == pid]
            p_identity = [i for i in sorted_events if i.get("event_type") == "IDENTITY_RESULT" and i.get("participant_id") == pid]
            p_resources = [r for r in access_events if r.get("participant_id") == pid]
            p_subs = [s for s in all_subs if s.get("participant_id") == pid]
            p_ctx = [c for c in context_entries if c.get("participant_id") == pid]
            p_actions = [a for a in actions_log if pid in a.get("target_participant_ids", [])]
            p_cases = [c for c in session_cases if c.get("participant_id") == pid]

            drilldowns[pid] = ParticipantDrilldown(
                participant_id=pid,
                display_name=f"Learner {pid[:8]}" if not pid in simulated_pids else f"Simulated {pid[:8]}",
                is_simulated=pid in simulated_pids,
                observation_state=proj.get("observation_state", "OBSERVABLE"),
                attention_pattern=proj.get("attention_pattern", "UNKNOWN"),
                coverage_ratio=proj.get("coverage_ratio", 1.0),
                no_data_duration_sec=total_no_data_sec,
                warning_streak=proj.get("warning_streak", 0),
                clean_streak=proj.get("clean_streak", 0),
                identity_state=proj.get("identity_state", "NOT_REQUESTED"),
                active_presence_state=proj.get("active_presence_state", "NOT_REQUESTED"),
                browser_context_state=proj.get("browser_context", "NO_ACTIVE_EVENT"),
                case_state=proj.get("case_state", "NONE"),
                active_reason_codes=proj.get("active_reason_codes", []),
                technical_reasons=proj.get("technical_reasons", []),
                windows=p_windows,
                browser_intervals=p_browser,
                active_presence_history=p_presence,
                identity_history=[e.get("payload", {}) for e in p_identity],
                resource_accesses=p_resources,
                submissions=p_subs,
                context_entries=p_ctx,
                teacher_actions=p_actions,
                cases=p_cases,
            )

        now_iso = datetime.now(timezone.utc).isoformat()
        report_id = f"rep_{session_id}_{int(datetime.now(timezone.utc).timestamp())}"

        return ReportReadModel(
            report_id=report_id,
            session_id=session_id,
            tenant_id=tenant_id,
            generated_at=now_iso,
            schema_version=1,
            session_overview=overview,
            observation_coverage=coverage_summary,
            technical_uncertainty=tech_uncertainty,
            attention_patterns=attention_summary,
            identity_outcomes=identity_summary,
            active_presence=active_presence_summary,
            browser_visibility=browser_visibility_summary,
            resource_usage=resource_usage_summary,
            answer_submissions=answer_submissions_summary,
            student_context=student_context_summary,
            teacher_actions=teacher_actions_summary,
            recovery_outcomes=recovery_summary,
            review_prioritization=review_items,
            participant_drilldowns=drilldowns,
            event_reconciliation=reconciliation,
            is_suppressed_by_policy=is_no_analytics,
            suppression_reason=(
                "Behavioral and camera telemetry analytics suppressed per NO_ANALYTICS session policy."
                if is_no_analytics
                else None
            ),
        )
