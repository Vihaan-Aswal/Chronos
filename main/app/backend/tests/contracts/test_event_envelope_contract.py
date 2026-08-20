import pytest
from typing import Dict, Any
from tests.fixtures.synthetic_factories import (
    make_synthetic_session,
    make_synthetic_window,
)


def create_event_envelope(
    event_id: str,
    event_type: str,
    tenant_id: str,
    session_id: str,
    participant_id: str,
    actor_id: str,
    actor_role: str,
    source: str,
    occurred_at: str,
    received_at: str,
    server_sequence: int,
    policy_id: str,
    policy_version: str,
    is_demo: bool,
    payload: Dict[str, Any],
    correlation_id: str = "corr-001",
    causation_id: str = "caus-001",
    schema_version: int = 1,
) -> Dict[str, Any]:
    """Generates the standard Chronos Event Envelope matching canonical LOGIC_AND_EVENT_SPEC."""
    # Ensure payload contains no raw frames or continuous biometrics
    prohibited_keys = {"raw_frame", "frame_base64", "continuous_landmarks", "face_crop"}
    assert not any(k in payload for k in prohibited_keys), "Prohibited raw media found in payload"

    return {
        "event_id": event_id,
        "event_type": event_type,
        "schema_version": schema_version,
        "tenant_id": tenant_id,
        "session_id": session_id,
        "participant_id": participant_id,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "source": source,
        "occurred_at": occurred_at,
        "received_at": received_at,
        "server_sequence": server_sequence,
        "correlation_id": correlation_id,
        "causation_id": causation_id,
        "policy_id": policy_id,
        "policy_version": policy_version,
        "model_versions": {},
        "is_demo": is_demo,
        "payload": payload,
    }


@pytest.mark.contract
class TestEventEnvelopeContract:
    def test_canonical_envelope_structure(self, clock, id_gen):
        event = create_event_envelope(
            event_id=id_gen.next_uuid("evt"),
            event_type="WINDOW_FINALIZED",
            tenant_id="ten-0001",
            session_id="ses-0001",
            participant_id="usr-student-1",
            actor_id="usr-student-1",
            actor_role="participant",
            source="server",
            occurred_at=clock.now_iso(),
            received_at=clock.now_iso(),
            server_sequence=1,
            policy_id="RESOURCE_SUPPORTED_ASSESSMENT",
            policy_version="assessment-v1",
            is_demo=False,
            payload=make_synthetic_window(),
        )

        required_keys = [
            "event_id",
            "event_type",
            "schema_version",
            "tenant_id",
            "session_id",
            "participant_id",
            "actor_id",
            "actor_role",
            "source",
            "occurred_at",
            "received_at",
            "server_sequence",
            "correlation_id",
            "causation_id",
            "policy_id",
            "policy_version",
            "model_versions",
            "is_demo",
            "payload",
        ]

        for k in required_keys:
            assert k in event, f"Missing required envelope field: {k}"

        assert event["schema_version"] == 1
        assert event["is_demo"] is False
        assert event["server_sequence"] == 1
        assert isinstance(event["payload"], dict)

    def test_demo_and_real_event_flagging_is_distinct(self, clock, id_gen):
        real_event = create_event_envelope(
            event_id=id_gen.next_uuid("evt"),
            event_type="WINDOW_FINALIZED",
            tenant_id="ten-0001",
            session_id="ses-real",
            participant_id="usr-student-1",
            actor_id="usr-student-1",
            actor_role="participant",
            source="server",
            occurred_at=clock.now_iso(),
            received_at=clock.now_iso(),
            server_sequence=1,
            policy_id="RESOURCE_SUPPORTED_ASSESSMENT",
            policy_version="assessment-v1",
            is_demo=False,
            payload=make_synthetic_window(is_demo=False),
        )

        demo_event = create_event_envelope(
            event_id=id_gen.next_uuid("evt"),
            event_type="WINDOW_FINALIZED",
            tenant_id="ten-0001",
            session_id="ses-demo",
            participant_id="usr-sim-1",
            actor_id="usr-sim-1",
            actor_role="participant",
            source="server",
            occurred_at=clock.now_iso(),
            received_at=clock.now_iso(),
            server_sequence=1,
            policy_id="RESOURCE_SUPPORTED_ASSESSMENT",
            policy_version="assessment-v1",
            is_demo=True,
            payload=make_synthetic_window(is_demo=True),
        )

        assert real_event["is_demo"] is False
        assert demo_event["is_demo"] is True

    def test_prohibited_raw_frames_rejected_from_payload(self, clock, id_gen):
        with pytest.raises(AssertionError, match="Prohibited raw media"):
            create_event_envelope(
                event_id=id_gen.next_uuid("evt"),
                event_type="WINDOW_FINALIZED",
                tenant_id="ten-0001",
                session_id="ses-0001",
                participant_id="usr-student-1",
                actor_id="usr-student-1",
                actor_role="participant",
                source="server",
                occurred_at=clock.now_iso(),
                received_at=clock.now_iso(),
                server_sequence=1,
                policy_id="RESOURCE_SUPPORTED_ASSESSMENT",
                policy_version="assessment-v1",
                is_demo=False,
                payload={"raw_frame": "base64data..."},
            )
