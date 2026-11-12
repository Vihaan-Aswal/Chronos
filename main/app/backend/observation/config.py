"""
Chronos Pure Observation Clock Configuration
Domain Subsystem: Observation & State Machine
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ObservationClockConfig:
    window_duration_sec: float = 60.0
    sample_interval_sec: float = 5.0
    expected_segments: int = 12
    min_usable_segments: int = 9  # 75%
    late_event_grace_sec: float = 2.0
    finalization_target_sec: float = 5.0
    warning_cue_exposure_sec: float = 20.0
    min_cue_interval_sec: float = 2.0
    stale_evidence_timeout_sec: float = 300.0
    student_reminder_cooldown_sec: float = 300.0
    teacher_notification_cooldown_sec: float = 600.0
    is_demo: bool = False

    @property
    def min_coverage_ratio(self) -> float:
        return self.min_usable_segments / self.expected_segments if self.expected_segments > 0 else 0.0


def get_config(is_demo: bool = False) -> ObservationClockConfig:
    """Return the authoritative observation clock configuration for real or demo execution."""
    if is_demo:
        return ObservationClockConfig(
            window_duration_sec=10.0,
            sample_interval_sec=1.0,
            expected_segments=10,
            min_usable_segments=8,  # 80%
            late_event_grace_sec=0.5,
            finalization_target_sec=1.0,
            warning_cue_exposure_sec=4.0,
            min_cue_interval_sec=1.0,
            stale_evidence_timeout_sec=60.0,
            student_reminder_cooldown_sec=20.0,
            teacher_notification_cooldown_sec=30.0,
            is_demo=True,
        )
    return ObservationClockConfig(
        window_duration_sec=60.0,
        sample_interval_sec=5.0,
        expected_segments=12,
        min_usable_segments=9,  # 75%
        late_event_grace_sec=2.0,
        finalization_target_sec=5.0,
        warning_cue_exposure_sec=20.0,
        min_cue_interval_sec=2.0,
        stale_evidence_timeout_sec=300.0,
        student_reminder_cooldown_sec=300.0,
        teacher_notification_cooldown_sec=600.0,
        is_demo=False,
    )
