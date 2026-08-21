"""
Chronos Live In-Flight Server-Side Window Manager (W3.3, W4.3, P1-02)
Buffers incoming telemetry samples, evaluates window boundaries in real time,
commits WINDOW_FINALIZED events into durable storage, and broadcasts state
transitions to connected teacher WebSockets.
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
import uuid

from chronos_logging import get_logger
from observation.config import ObservationClockConfig, get_config
from observation.classifier import UsableSegmentClassifier
from observation.window_evaluator import WindowEvaluator, _normalize_dt
from observation.state_machine import ObservationStateMachine
from websocket_manager import manager

logger = get_logger("chronos.observation.live_window")


class ParticipantWindowBuffer:
    def __init__(
        self,
        session_id: str,
        participant_id: str,
        tenant_id: str,
        policy_id: str,
        is_demo: bool = False,
        window_start: Optional[datetime] = None,
    ):
        self.session_id = session_id
        self.participant_id = participant_id
        self.tenant_id = tenant_id
        self.policy_id = policy_id
        self.is_demo = is_demo
        self.config: ObservationClockConfig = get_config(is_demo=is_demo)

        now = datetime.now(timezone.utc)
        self.window_start: datetime = window_start or now
        self.window_end: datetime = self.window_start + timedelta(seconds=self.config.window_duration_sec)
        self.window_id: str = f"win-{session_id}-{participant_id}-{int(self.window_start.timestamp())}"
        self.evaluator = WindowEvaluator(
            config=self.config,
            is_demo=self.is_demo,
            window_id=self.window_id,
            window_start=self.window_start,
            window_end=self.window_end,
        )
        self.last_sample_time: datetime = now

    def add_sample(self, sample_data: Dict[str, Any], timestamp: Optional[datetime] = None) -> bool:
        ts = timestamp or datetime.now(timezone.utc)
        self.last_sample_time = ts
        return self.evaluator.add_sample(sample_data, timestamp=ts)

    def is_window_elapsed(self, current_time: Optional[datetime] = None) -> bool:
        now = current_time or datetime.now(timezone.utc)
        grace = timedelta(seconds=self.config.late_event_grace_sec)
        return now >= (self.window_end + grace)

    def advance_to_next_window(self, next_start: Optional[datetime] = None):
        start = next_start or self.window_end
        self.window_start = start
        self.window_end = start + timedelta(seconds=self.config.window_duration_sec)
        self.window_id = f"win-{self.session_id}-{self.participant_id}-{int(self.window_start.timestamp())}"
        self.evaluator = WindowEvaluator(
            config=self.config,
            is_demo=self.is_demo,
            window_id=self.window_id,
            window_start=self.window_start,
            window_end=self.window_end,
        )


class LiveWindowManager:
    """
    Thread-safe in-memory manager tracking active live session window buffers.
    Runs an asynchronous loop to finalize windows and commit events authoritative to durable storage.
    """

    def __init__(self, repository: Optional[Any] = None):
        self._buffers: Dict[Tuple[str, str], ParticipantWindowBuffer] = {}
        self._lock = asyncio.Lock()
        self._loop_task: Optional[asyncio.Task] = None
        self._running: bool = False
        self._repo = repository

    def set_repository(self, repository: Any):
        self._repo = repository

    def _get_repository(self) -> Optional[Any]:
        if self._repo is not None:
            return self._repo
        try:
            import main
            return getattr(main, "repository", None)
        except Exception:
            return None

    async def start_background_loop(self, interval_seconds: float = 0.5):
        """Starts the periodic background evaluation worker."""
        if self._running:
            return
        self._running = True
        self._loop_task = asyncio.create_task(self._run_loop(interval_seconds))
        logger.info("LiveWindowManager background loop started.")

    async def stop_background_loop(self):
        """Gracefully cancels the background evaluation worker."""
        self._running = False
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        logger.info("LiveWindowManager background loop stopped.")

    async def _run_loop(self, interval_seconds: float):
        while self._running:
            try:
                await self.evaluate_elapsed_windows()
            except Exception as e:
                logger.error(f"Error in LiveWindowManager loop: {e}", exc_info=True)
            await asyncio.sleep(interval_seconds)

    async def buffer_sample(
        self,
        session_id: str,
        participant_id: str,
        tenant_id: str,
        policy_id: str,
        is_demo: bool,
        sample_data: Dict[str, Any],
        occurred_at: Optional[Union[datetime, str]] = None,
    ) -> bool:
        """Buffers an incoming observation sample into the active window."""
        dt = _normalize_dt(occurred_at) or datetime.now(timezone.utc)
        key = (session_id, participant_id)

        async with self._lock:
            if key not in self._buffers:
                self._buffers[key] = ParticipantWindowBuffer(
                    session_id=session_id,
                    participant_id=participant_id,
                    tenant_id=tenant_id,
                    policy_id=policy_id,
                    is_demo=is_demo,
                    window_start=dt,
                )
            buf = self._buffers[key]

            # If incoming sample is far ahead of current window end, finalize past windows
            if dt > (buf.window_end + timedelta(seconds=buf.config.late_event_grace_sec)):
                await self._finalize_single_buffer_locked(buf, dt)

            return buf.add_sample(sample_data, timestamp=dt)

    async def evaluate_elapsed_windows(self, current_time: Optional[datetime] = None):
        """Scans all active participant buffers and finalizes any elapsed windows."""
        now = current_time or datetime.now(timezone.utc)
        async with self._lock:
            for key, buf in list(self._buffers.items()):
                if buf.is_window_elapsed(now):
                    await self._finalize_single_buffer_locked(buf, now)

    async def _finalize_single_buffer_locked(
        self, buf: ParticipantWindowBuffer, current_time: datetime
    ):
        """Internal helper to finalize a buffer and emit durable events."""
        finalized_payload = buf.evaluator.finalize()
        repo = self._get_repository()

        # Retrieve current projection state to initialize state machine
        current_proj = repo.get_participant_projection(buf.session_id, buf.participant_id) if repo else {}
        if not current_proj:
            current_proj = {}

        sm = ObservationStateMachine(
            config=buf.config,
            is_demo=buf.is_demo,
            initial_warning_streak=current_proj.get("warning_streak", 0),
            initial_clean_streak=current_proj.get("clean_streak", 0),
            initial_attention_pattern=current_proj.get("attention_pattern", "UNKNOWN"),
            initial_case_state=current_proj.get("case_state", "NONE"),
        )
        if current_proj.get("no_data_start_iso"):
            try:
                sm.no_data_start_time = datetime.fromisoformat(
                    current_proj["no_data_start_iso"].replace("Z", "+00:00")
                )
            except Exception:
                sm.no_data_start_time = None

        win_end_iso = finalized_payload.get("window_end") or buf.window_end.isoformat()
        eval_result = sm.evaluate_window(finalized_payload, timestamp=win_end_iso)

        finalized_payload["warning_streak"] = sm.warning_streak
        finalized_payload["clean_streak"] = sm.clean_streak

        window_evt = {
            "event_id": str(uuid.uuid4()),
            "event_type": "WINDOW_FINALIZED",
            "schema_version": 1,
            "tenant_id": buf.tenant_id,
            "session_id": buf.session_id,
            "participant_id": buf.participant_id,
            "actor_id": "system",
            "actor_role": "system",
            "source": "server",
            "occurred_at": win_end_iso,
            "policy_id": buf.policy_id,
            "is_demo": buf.is_demo,
            "payload": finalized_payload,
        }

        try:
            persisted_evt = repo.append_event(window_evt) if repo else window_evt
            updated_proj = repo.get_participant_projection(buf.session_id, buf.participant_id) if repo else {}

            logger.info(
                f"Live window finalized for {buf.participant_id} in {buf.session_id}: {finalized_payload.get('classification')}",
                extra={
                    "event_type": "WINDOW_FINALIZED",
                    "session_id": buf.session_id,
                    "participant_id": buf.participant_id,
                    "classification": finalized_payload.get("classification"),
                    "warning_streak": sm.warning_streak,
                    "clean_streak": sm.clean_streak,
                },
            )

            # Broadcast to connected teacher WebSockets
            await manager.broadcast_to_teachers(
                buf.session_id,
                {
                    "type": "WINDOW_FINALIZED",
                    "event_type": "WINDOW_FINALIZED",
                    "session_id": buf.session_id,
                    "participant_id": buf.participant_id,
                    "user_id": buf.participant_id,
                    "payload": finalized_payload,
                    "projection": updated_proj,
                    "timestamp": win_end_iso,
                },
            )
        except Exception as e:
            logger.error(f"Failed to commit finalized window event: {e}", exc_info=True)

        # Advance buffer to next window
        buf.advance_to_next_window()

    async def flush_session(self, session_id: str):
        """Evaluates and clears all participant buffers for an ending session."""
        now = datetime.now(timezone.utc)
        async with self._lock:
            keys_to_remove = [k for k in self._buffers if k[0] == session_id]
            for key in keys_to_remove:
                buf = self._buffers[key]
                if buf.evaluator.segments:
                    await self._finalize_single_buffer_locked(buf, now)
                del self._buffers[key]

    async def clear_session(self, session_id: str):
        """Discards in-memory buffers for a session without finalizing."""
        async with self._lock:
            keys_to_remove = [k for k in self._buffers if k[0] == session_id]
            for key in keys_to_remove:
                del self._buffers[key]


# Global singleton instance
live_window_manager = LiveWindowManager()
