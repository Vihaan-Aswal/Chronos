"""
Chronos Active Presence Protocol & Challenge Lifecycle Manager
Workstream W4: Local Observation, Browser Context, and Active Presence
Specification: LOGIC_AND_EVENT_SPEC.md §6 & QUALITY_REQUIREMENTS.md §3

Pure & stateful challenge lifecycle rules:
1. Challenge binding: tenant_id, session_id, participant_id, challenge_id, nonce.
2. Randomized 2-action sequence selected from compatible pool (no repetition, no opposite pairs).
3. 15-second challenge expiry.
4. Maximum 2 attempts per challenge.
5. Single-use token/nonce consumption.
6. Cooldowns:
   - 60-second cooldown after completed challenge.
   - Maximum 3 automated checks per 60 minutes per participant.
   - 5-minute cooldown for teacher-requested checks per participant.
7. Result states:
   - REQUESTED, IN_PROGRESS, PASSED, QUALITY_FAIL, TIMED_OUT, DECLINED, UNAVAILABLE, RETRY_REQUIRED, MANUAL_REVIEW.
8. Core Invariant: Active Presence NEVER alters attention score, pattern, or warning/clean streaks.
"""
from __future__ import annotations
import secrets
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union

from contracts import ActivePresenceAction, PolicyId


class ActivePresenceResultState(str, Enum):
    REQUESTED = "REQUESTED"
    IN_PROGRESS = "IN_PROGRESS"
    PASSED = "PASSED"
    QUALITY_FAIL = "QUALITY_FAIL"
    TIMED_OUT = "TIMED_OUT"
    DECLINED = "DECLINED"
    UNAVAILABLE = "UNAVAILABLE"
    RETRY_REQUIRED = "RETRY_REQUIRED"
    MANUAL_REVIEW = "MANUAL_REVIEW"


# Canonical compatible action pool (no opposing pairs, no duplicates)
COMPATIBLE_ACTION_PAIRS: List[Tuple[str, str]] = [
    ("TURN_LEFT", "LOOK_UP"),
    ("TURN_LEFT", "LOOK_DOWN"),
    ("TURN_LEFT", "NOD"),
    ("TURN_RIGHT", "LOOK_UP"),
    ("TURN_RIGHT", "LOOK_DOWN"),
    ("TURN_RIGHT", "NOD"),
    ("LOOK_UP", "TURN_LEFT"),
    ("LOOK_UP", "TURN_RIGHT"),
    ("LOOK_UP", "NOD"),
    ("LOOK_DOWN", "TURN_LEFT"),
    ("LOOK_DOWN", "TURN_RIGHT"),
    ("LOOK_DOWN", "NOD"),
    ("NOD", "TURN_LEFT"),
    ("NOD", "TURN_RIGHT"),
    ("NOD", "LOOK_UP"),
    ("NOD", "LOOK_DOWN"),
]

# Set of forbidden opposite pairs
OPPOSING_PAIRS = {
    ("TURN_LEFT", "TURN_RIGHT"),
    ("TURN_RIGHT", "TURN_LEFT"),
    ("LOOK_UP", "LOOK_DOWN"),
    ("LOOK_DOWN", "LOOK_UP"),
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(dt_val: Optional[Union[datetime, str]]) -> datetime:
    if dt_val is None:
        return _now_utc()
    if isinstance(dt_val, datetime):
        return dt_val if dt_val.tzinfo is not None else dt_val.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(dt_val).replace("Z", "+00:00"))
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return _now_utc()


@dataclass
class ActivePresenceChallenge:
    challenge_id: str
    tenant_id: str
    session_id: str
    participant_id: str
    nonce: str
    actions: List[str]
    issued_at: datetime
    expires_at: datetime
    attempt_number: int = 1
    max_attempts: int = 2
    trigger: str = "join"
    is_teacher_initiated: bool = False
    status: ActivePresenceResultState = ActivePresenceResultState.REQUESTED
    consumed: bool = False
    completed_at: Optional[datetime] = None
    elapsed_ms: Optional[int] = None
    failure_reason: Optional[str] = None
    alternative_verification_used: bool = False

    @property
    def is_expired(self) -> bool:
        return _now_utc() > self.expires_at

    def to_dict(self) -> Dict[str, Any]:
        return {
            "challenge_id": self.challenge_id,
            "tenant_id": self.tenant_id,
            "session_id": self.session_id,
            "participant_id": self.participant_id,
            "nonce": self.nonce,
            "actions": list(self.actions),
            "sequence": list(self.actions),
            "issued_at": self.issued_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "expires_in_sec": max(0, int((self.expires_at - _now_utc()).total_seconds())),
            "attempt_number": self.attempt_number,
            "max_attempts": self.max_attempts,
            "trigger": self.trigger,
            "status": self.status.value if isinstance(self.status, ActivePresenceResultState) else str(self.status),
            "consumed": self.consumed,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "elapsed_ms": self.elapsed_ms,
            "failure_reason": self.failure_reason,
            "alternative_verification_used": self.alternative_verification_used,
        }


class ActivePresenceChallengeManager:
    """
    Thread-safe lifecycle manager and security verifier for Active Presence Challenges.
    """

    CHALLENGE_TTL_SECONDS: int = 15
    MAX_ATTEMPTS: int = 2
    COMPLETED_COOLDOWN_SECONDS: int = 60
    TEACHER_COOLDOWN_SECONDS: int = 300  # 5 minutes
    MAX_AUTO_CHECKS_PER_HOUR: int = 3

    def __init__(self):
        self._lock = threading.Lock()
        # challenge_id -> ActivePresenceChallenge
        self._challenges: Dict[str, ActivePresenceChallenge] = {}
        # (session_id, participant_id) -> last completed timestamp
        self._last_completed: Dict[Tuple[str, str], datetime] = {}
        # (session_id, participant_id) -> last teacher-initiated timestamp
        self._last_teacher_request: Dict[Tuple[str, str], datetime] = {}
        # (session_id, participant_id) -> list of auto challenge timestamps in last hour
        self._auto_history: Dict[Tuple[str, str], List[datetime]] = {}

    def select_compatible_actions(self) -> List[str]:
        """Selects 2 distinct compatible actions without repetition or opposing pairs."""
        pair = secrets.choice(COMPATIBLE_ACTION_PAIRS)
        return list(pair)

    def validate_action_sequence(self, actions: List[str]) -> bool:
        """Validates that action sequence meets compatibility rules."""
        if not actions or len(actions) != 2:
            return False
        a1, a2 = actions[0], actions[1]
        if a1 == a2:
            return False
        if (a1, a2) in OPPOSING_PAIRS or (a2, a1) in OPPOSING_PAIRS:
            return False
        valid_actions = {a.value for a in ActivePresenceAction}
        return a1 in valid_actions and a2 in valid_actions

    def check_cooldown(
        self,
        session_id: str,
        participant_id: str,
        is_teacher_initiated: bool = False,
        now: Optional[datetime] = None,
    ) -> Tuple[bool, Optional[str], Optional[int]]:
        """
        Validates whether a new challenge can be issued.
        Returns: (allowed, reason_if_denied, retry_after_sec)
        """
        current = now or _now_utc()
        key = (session_id, participant_id)

        with self._lock:
            # 1. Check completed challenge cooldown (60s)
            last_comp = self._last_completed.get(key)
            if last_comp is not None:
                elapsed = (current - last_comp).total_seconds()
                if elapsed < self.COMPLETED_COOLDOWN_SECONDS:
                    retry_after = int(self.COMPLETED_COOLDOWN_SECONDS - elapsed)
                    return False, f"Completed challenge cooldown active ({retry_after}s remaining)", retry_after

            # 2. Check teacher-initiated cooldown (5 minutes)
            if is_teacher_initiated:
                last_teacher = self._last_teacher_request.get(key)
                if last_teacher is not None:
                    elapsed = (current - last_teacher).total_seconds()
                    if elapsed < self.TEACHER_COOLDOWN_SECONDS:
                        retry_after = int(self.TEACHER_COOLDOWN_SECONDS - elapsed)
                        return False, f"Teacher challenge cooldown active ({retry_after}s remaining)", retry_after

            # 3. Check automated challenge quota (max 3 per 60m)
            if not is_teacher_initiated:
                history = self._auto_history.get(key, [])
                one_hour_ago = current - timedelta(hours=1)
                recent = [ts for ts in history if ts > one_hour_ago]
                self._auto_history[key] = recent
                if len(recent) >= self.MAX_AUTO_CHECKS_PER_HOUR:
                    oldest = min(recent)
                    retry_after = int(3600 - (current - oldest).total_seconds())
                    return False, f"Maximum automated checks reached (3/hour, retry in {retry_after}s)", max(1, retry_after)

            return True, None, None

    def create_challenge(
        self,
        tenant_id: str,
        session_id: str,
        participant_id: str,
        trigger: str = "join",
        policy_id: Union[PolicyId, str] = PolicyId.CLASSROOM,
        is_teacher_initiated: bool = False,
        now: Optional[datetime] = None,
        custom_actions: Optional[List[str]] = None,
    ) -> ActivePresenceChallenge:
        """
        Creates a new single-use Active Presence challenge bound to session and participant.
        """
        policy_str = policy_id.value if isinstance(policy_id, PolicyId) else str(policy_id).upper()
        if policy_str == "NO_ANALYTICS":
            raise ValueError("Active Presence checks are disabled under NO_ANALYTICS policy.")

        current = now or _now_utc()
        allowed, reason, retry_after = self.check_cooldown(
            session_id=session_id,
            participant_id=participant_id,
            is_teacher_initiated=is_teacher_initiated,
            now=current,
        )
        if not allowed:
            raise PermissionError(f"Challenge denied: {reason}")

        if custom_actions and self.validate_action_sequence(custom_actions):
            actions = list(custom_actions)
        else:
            actions = self.select_compatible_actions()

        challenge_id = str(uuid.uuid4())
        nonce = secrets.token_hex(16)
        expires_at = current + timedelta(seconds=self.CHALLENGE_TTL_SECONDS)

        challenge = ActivePresenceChallenge(
            challenge_id=challenge_id,
            tenant_id=tenant_id,
            session_id=session_id,
            participant_id=participant_id,
            nonce=nonce,
            actions=actions,
            issued_at=current,
            expires_at=expires_at,
            attempt_number=1,
            max_attempts=self.MAX_ATTEMPTS,
            trigger=trigger,
            is_teacher_initiated=is_teacher_initiated,
            status=ActivePresenceResultState.REQUESTED,
            consumed=False,
        )

        with self._lock:
            self._challenges[challenge_id] = challenge
            key = (session_id, participant_id)
            if is_teacher_initiated:
                self._last_teacher_request[key] = current
            else:
                self._auto_history.setdefault(key, []).append(current)

        return challenge

    def get_challenge(self, challenge_id: str) -> Optional[ActivePresenceChallenge]:
        with self._lock:
            return self._challenges.get(challenge_id)

    def start_challenge(
        self,
        challenge_id: str,
        participant_id: str,
        session_id: str,
        now: Optional[datetime] = None,
    ) -> ActivePresenceChallenge:
        """Transitions challenge to IN_PROGRESS after verifying binding."""
        current = now or _now_utc()
        with self._lock:
            challenge = self._challenges.get(challenge_id)
            if not challenge:
                raise ValueError("Challenge not found")
            if challenge.session_id != session_id:
                raise PermissionError("Cross-session challenge access denied")
            if challenge.participant_id != participant_id:
                raise PermissionError("Cross-participant challenge access denied")
            if challenge.consumed:
                raise ValueError("Challenge already consumed")
            if current > challenge.expires_at:
                challenge.status = ActivePresenceResultState.TIMED_OUT
                challenge.consumed = True
                challenge.completed_at = current
                raise TimeoutError("Challenge has expired")

            challenge.status = ActivePresenceResultState.IN_PROGRESS
            return challenge

    def respond_to_challenge(
        self,
        challenge_id: str,
        participant_id: str,
        session_id: str,
        nonce: str,
        submitted_actions: Optional[List[str]] = None,
        quality_ok: bool = True,
        elapsed_ms: Optional[int] = None,
        is_neutral_baseline_held: bool = True,
        is_return_to_neutral_held: bool = True,
        alternative_verification: bool = False,
        now: Optional[datetime] = None,
    ) -> Tuple[ActivePresenceResultState, Dict[str, Any]]:
        """
        Validates client challenge response proofs.
        """
        current = now or _now_utc()
        with self._lock:
            challenge = self._challenges.get(challenge_id)
            if not challenge:
                return ActivePresenceResultState.QUALITY_FAIL, {"error": "Challenge not found"}

            # Security verification 1: Cross-session check
            if challenge.session_id != session_id:
                return ActivePresenceResultState.QUALITY_FAIL, {"error": "Cross-session challenge rejected"}

            # Security verification 2: Cross-participant check
            if challenge.participant_id != participant_id:
                return ActivePresenceResultState.QUALITY_FAIL, {"error": "Cross-participant challenge rejected"}

            # Security verification 3: Single-use nonce & replay check
            if challenge.consumed or challenge.nonce != nonce:
                return ActivePresenceResultState.QUALITY_FAIL, {"error": "Invalid or replayed challenge token"}

            # Security verification 4: Expiry check
            if current > challenge.expires_at:
                challenge.status = ActivePresenceResultState.TIMED_OUT
                challenge.consumed = True
                challenge.completed_at = current
                challenge.failure_reason = "Challenge expired (15s timeout)"
                return ActivePresenceResultState.TIMED_OUT, challenge.to_dict()

            challenge.elapsed_ms = elapsed_ms
            challenge.alternative_verification_used = alternative_verification

            # Case A: Alternative Neutral verification path (Accessibility)
            if alternative_verification:
                challenge.status = ActivePresenceResultState.PASSED
                challenge.consumed = True
                challenge.completed_at = current
                self._last_completed[(session_id, participant_id)] = current
                return ActivePresenceResultState.PASSED, challenge.to_dict()

            # Case B: Quality failure handling
            if not quality_ok:
                if challenge.attempt_number < challenge.max_attempts:
                    challenge.attempt_number += 1
                    challenge.status = ActivePresenceResultState.RETRY_REQUIRED
                    challenge.failure_reason = "Quality insufficient; retry required"
                    return ActivePresenceResultState.RETRY_REQUIRED, challenge.to_dict()
                else:
                    challenge.status = ActivePresenceResultState.QUALITY_FAIL
                    challenge.consumed = True
                    challenge.completed_at = current
                    challenge.failure_reason = "Quality insufficient after maximum attempts"
                    return ActivePresenceResultState.QUALITY_FAIL, challenge.to_dict()

            # Case C: Baseline and neutral hold requirements
            if not is_neutral_baseline_held or not is_return_to_neutral_held:
                if challenge.attempt_number < challenge.max_attempts:
                    challenge.attempt_number += 1
                    challenge.status = ActivePresenceResultState.RETRY_REQUIRED
                    challenge.failure_reason = "Neutral baseline or return to center not held"
                    return ActivePresenceResultState.RETRY_REQUIRED, challenge.to_dict()
                else:
                    challenge.status = ActivePresenceResultState.QUALITY_FAIL
                    challenge.consumed = True
                    challenge.completed_at = current
                    challenge.failure_reason = "Failed neutral hold sequence"
                    return ActivePresenceResultState.QUALITY_FAIL, challenge.to_dict()

            # Case D: Action sequence verification
            if submitted_actions != challenge.actions:
                if challenge.attempt_number < challenge.max_attempts:
                    challenge.attempt_number += 1
                    challenge.status = ActivePresenceResultState.RETRY_REQUIRED
                    challenge.failure_reason = "Action sequence mismatch"
                    return ActivePresenceResultState.RETRY_REQUIRED, challenge.to_dict()
                else:
                    challenge.status = ActivePresenceResultState.QUALITY_FAIL
                    challenge.consumed = True
                    challenge.completed_at = current
                    challenge.failure_reason = "Incorrect action sequence"
                    return ActivePresenceResultState.QUALITY_FAIL, challenge.to_dict()

            # Passed!
            challenge.status = ActivePresenceResultState.PASSED
            challenge.consumed = True
            challenge.completed_at = current
            self._last_completed[(session_id, participant_id)] = current
            return ActivePresenceResultState.PASSED, challenge.to_dict()

    def decline_challenge(
        self,
        challenge_id: str,
        participant_id: str,
        session_id: str,
        reason: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> Tuple[ActivePresenceResultState, Dict[str, Any]]:
        """Handles student opting out / declining check (non-punitive fallback)."""
        current = now or _now_utc()
        with self._lock:
            challenge = self._challenges.get(challenge_id)
            if not challenge:
                return ActivePresenceResultState.DECLINED, {"error": "Challenge not found"}
            if challenge.session_id != session_id or challenge.participant_id != participant_id:
                return ActivePresenceResultState.DECLINED, {"error": "Cross-session/participant mismatch"}

            challenge.status = ActivePresenceResultState.DECLINED
            challenge.consumed = True
            challenge.completed_at = current
            challenge.failure_reason = reason or "Participant declined check"
            return ActivePresenceResultState.DECLINED, challenge.to_dict()

    def request_manual_review(
        self,
        challenge_id: str,
        participant_id: str,
        session_id: str,
        reason: Optional[str] = None,
        now: Optional[datetime] = None,
    ) -> Tuple[ActivePresenceResultState, Dict[str, Any]]:
        """Handles student requesting teacher manual check (accessibility / hardware path)."""
        current = now or _now_utc()
        with self._lock:
            challenge = self._challenges.get(challenge_id)
            if not challenge:
                return ActivePresenceResultState.MANUAL_REVIEW, {"error": "Challenge not found"}
            if challenge.session_id != session_id or challenge.participant_id != participant_id:
                return ActivePresenceResultState.MANUAL_REVIEW, {"error": "Cross-session/participant mismatch"}

            challenge.status = ActivePresenceResultState.MANUAL_REVIEW
            challenge.consumed = True
            challenge.completed_at = current
            challenge.failure_reason = reason or "Manual verification requested"
            return ActivePresenceResultState.MANUAL_REVIEW, challenge.to_dict()

    def record_unavailable(
        self,
        challenge_id: str,
        participant_id: str,
        session_id: str,
        reason: str = "CAMERA_UNAVAILABLE",
        now: Optional[datetime] = None,
    ) -> Tuple[ActivePresenceResultState, Dict[str, Any]]:
        """Handles camera/hardware unavailability."""
        current = now or _now_utc()
        with self._lock:
            challenge = self._challenges.get(challenge_id)
            if not challenge:
                return ActivePresenceResultState.UNAVAILABLE, {"error": "Challenge not found"}
            challenge.status = ActivePresenceResultState.UNAVAILABLE
            challenge.consumed = True
            challenge.completed_at = current
            challenge.failure_reason = reason
            return ActivePresenceResultState.UNAVAILABLE, challenge.to_dict()

    def reset_state_for_tests(self):
        """Resets all in-memory challenge state for clean isolated testing."""
        with self._lock:
            self._challenges.clear()
            self._last_completed.clear()
            self._last_teacher_request.clear()
            self._auto_history.clear()


# Global Singleton Instance
challenge_manager = ActivePresenceChallengeManager()
