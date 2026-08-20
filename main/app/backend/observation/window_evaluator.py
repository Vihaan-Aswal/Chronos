"""
Chronos Window Evaluator
Domain Subsystem: Observation & State Machine
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Set, Union

from .config import ObservationClockConfig, get_config
from .classifier import UsableSegmentClassifier, SegmentClassificationResult


def _normalize_dt(dt_val: Optional[Union[datetime, str]]) -> Optional[datetime]:
    if dt_val is None:
        return None
    if isinstance(dt_val, str):
        try:
            dt_val = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
        except Exception:
            return None
    if dt_val.tzinfo is None:
        dt_val = dt_val.replace(tzinfo=timezone.utc)
    return dt_val


class WindowEvaluator:
    """
    Stateful and pure evaluator for observation time windows.
    Accumulates telemetry segments, calculates qualified attention cue exposure,
    and produces deterministic WindowFinalized payloads.
    """

    def __init__(
        self,
        config: Optional[ObservationClockConfig] = None,
        is_demo: bool = False,
        window_id: Optional[str] = None,
        window_start: Optional[Union[datetime, str]] = None,
        window_end: Optional[Union[datetime, str]] = None,
    ):
        self.config = config or get_config(is_demo=is_demo)
        self.window_id = window_id or f"win-{int(datetime.now(timezone.utc).timestamp())}"
        self.window_start = _normalize_dt(window_start)
        self.window_end = _normalize_dt(window_end)
        self.segments: List[SegmentClassificationResult] = []
        self.seen_sample_ids: Set[str] = set()

    def add_sample(
        self,
        sample: Union[Dict[str, Any], Any],
        timestamp: Optional[Union[datetime, str]] = None,
    ) -> bool:
        """
        Accepts, validates, classifies and appends a single sample to the current window.
        Returns True if accepted, False if discarded (duplicate or out of grace period).
        """
        if hasattr(sample, "model_dump"):
            data = sample.model_dump()
        elif hasattr(sample, "dict"):
            data = sample.dict()
        elif isinstance(sample, dict):
            data = sample
        else:
            data = getattr(sample, "__dict__", {})

        # 1. Deduplication check
        sample_id = data.get("sample_id")
        if sample_id:
            if str(sample_id) in self.seen_sample_ids:
                return False  # Duplicate sample discarded
            self.seen_sample_ids.add(str(sample_id))

        # 2. Timing boundary and late grace check
        sample_dt = _normalize_dt(timestamp or data.get("timestamp") or data.get("occurred_at"))
        if sample_dt is not None:
            grace = timedelta(seconds=self.config.late_event_grace_sec)
            if self.window_start is not None and sample_dt < (self.window_start - grace):
                return False  # Sample before window boundary
            if self.window_end is not None and sample_dt > (self.window_end + grace):
                return False  # Late sample outside grace period

        # 3. Classify segment
        classified = UsableSegmentClassifier.classify(data)
        self.segments.append(classified)
        return True

    def evaluate(self) -> Dict[str, Any]:
        """Finalize and evaluate accumulated segments for the window."""
        return self.evaluate_segments(
            segments=self.segments,
            config=self.config,
            window_id=self.window_id,
            window_start=self.window_start,
            window_end=self.window_end,
        )

    def finalize(self) -> Dict[str, Any]:
        """Alias for evaluate()."""
        return self.evaluate()

    @classmethod
    def evaluate_segments(
        cls,
        segments: List[Union[Dict[str, Any], SegmentClassificationResult, Any]],
        config: Optional[ObservationClockConfig] = None,
        window_id: Optional[str] = None,
        window_start: Optional[Union[datetime, str]] = None,
        window_end: Optional[Union[datetime, str]] = None,
        is_demo: bool = False,
    ) -> Dict[str, Any]:
        """
        Pure, deterministic window evaluation given a sequence of segments.
        """
        clock_cfg = config or get_config(is_demo=is_demo)
        classified_segments: List[SegmentClassificationResult] = []

        for seg in segments:
            if isinstance(seg, SegmentClassificationResult):
                classified_segments.append(seg)
            else:
                classified_segments.append(UsableSegmentClassifier.classify(seg))

        usable_segments = [s for s in classified_segments if s.usable]
        num_usable = len(usable_segments)
        expected = clock_cfg.expected_segments
        coverage_ratio = round(num_usable / expected, 2) if expected > 0 else 0.0

        # Aggregate technical reasons across all disqualified segments
        tech_reasons: List[str] = []
        for s in classified_segments:
            if not s.usable:
                for tr in s.technical_reasons:
                    if tr not in tech_reasons:
                        tech_reasons.append(tr)

        # Insufficient usable segments -> NO_DATA / NOT_EVALUATED
        if num_usable < clock_cfg.min_usable_segments:
            if not tech_reasons:
                tech_reasons.append("CAMERA_UNAVAILABLE")
            return {
                "window_id": window_id or f"win-{int(datetime.now(timezone.utc).timestamp())}",
                "window_start": window_start.isoformat() if isinstance(window_start, datetime) else window_start,
                "window_end": window_end.isoformat() if isinstance(window_end, datetime) else window_end,
                "expected_segments": expected,
                "usable_segments": num_usable,
                "coverage_ratio": coverage_ratio,
                "observation_state": "NO_DATA",
                "classification": "NOT_EVALUATED",
                "cue_exposure_seconds": 0.0,
                "reason_codes": [],
                "technical_reasons": tech_reasons,
            }

        # Calculate qualified cue exposure across consecutive usable segments
        # Consecutive usable segments with cue_away=True form an interval
        qualified_intervals: List[float] = []
        current_run_length = 0

        for seg in classified_segments:
            if seg.usable and seg.cue_away:
                current_run_length += 1
            else:
                if current_run_length > 0:
                    duration = current_run_length * clock_cfg.sample_interval_sec
                    if duration >= clock_cfg.min_cue_interval_sec or duration >= clock_cfg.warning_cue_exposure_sec:
                        qualified_intervals.append(duration)
                    current_run_length = 0

        if current_run_length > 0:
            duration = current_run_length * clock_cfg.sample_interval_sec
            if duration >= clock_cfg.min_cue_interval_sec or duration >= clock_cfg.warning_cue_exposure_sec:
                qualified_intervals.append(duration)

        cue_exposure_seconds = round(sum(qualified_intervals), 2)
        qualified_interval_count = len(qualified_intervals)

        # Classification rule:
        # VALID_WARNING if cue_exposure_seconds >= warning_cue_exposure_sec and qualified_interval_count >= 1
        is_warning = (
            cue_exposure_seconds >= clock_cfg.warning_cue_exposure_sec
            and (
                qualified_interval_count >= 2
                or (qualified_interval_count == 1 and cue_exposure_seconds >= clock_cfg.warning_cue_exposure_sec)
            )
        )

        if is_warning:
            classification = "VALID_WARNING"
            reason_codes = ["ORIENTATION_AWAY"]
        else:
            classification = "VALID_CLEAN"
            reason_codes = []

        return {
            "window_id": window_id or f"win-{int(datetime.now(timezone.utc).timestamp())}",
            "window_start": window_start.isoformat() if isinstance(window_start, datetime) else window_start,
            "window_end": window_end.isoformat() if isinstance(window_end, datetime) else window_end,
            "expected_segments": expected,
            "usable_segments": num_usable,
            "coverage_ratio": coverage_ratio,
            "observation_state": "VALID",
            "classification": classification,
            "cue_exposure_seconds": cue_exposure_seconds,
            "reason_codes": reason_codes,
            "technical_reasons": [],
        }
