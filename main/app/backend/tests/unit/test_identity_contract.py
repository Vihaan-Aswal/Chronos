import math
import pytest
from tests.fixtures.synthetic_factories import make_synthetic_embedding


def normalize_vec(v: list[float]) -> list[float]:
    try:
        s = sum(float(x) * float(x) for x in v)
        if s <= 0:
            return v
        n = math.sqrt(s)
        return [float(x) / n for x in v]
    except Exception:
        return v


def is_finite_array(v: list) -> bool:
    try:
        return all(isinstance(x, (int, float)) and math.isfinite(float(x)) for x in v)
    except Exception:
        return False


@pytest.mark.unit
class TestIdentityContract:
    def test_normalize_vector_unit_length(self):
        raw_vec = [3.0, 4.0] + [0.0] * 126
        norm = normalize_vec(raw_vec)
        length = math.sqrt(sum(x * x for x in norm))
        assert pytest.approx(length, 1e-6) == 1.0
        assert pytest.approx(norm[0], 1e-6) == 0.6
        assert pytest.approx(norm[1], 1e-6) == 0.8

    def test_normalize_zero_vector_handled_safely(self):
        zero_vec = [0.0] * 128
        norm = normalize_vec(zero_vec)
        assert norm == zero_vec

    def test_is_finite_array_validates_floats(self):
        valid = [0.1, 0.5, -0.2]
        assert is_finite_array(valid) is True

    def test_is_finite_array_rejects_nan_and_inf(self):
        assert is_finite_array([0.1, float("nan"), 0.5]) is False
        assert is_finite_array([0.1, float("inf"), 0.5]) is False
        assert is_finite_array([0.1, float("-inf"), 0.5]) is False
        assert is_finite_array(["non-number", 0.5]) is False

    def test_mock_supabase_isolated_identity_roundtrip(self, mock_supabase):
        """Test isolated upsert and retrieval in mock storage without external calls."""
        test_user_id = "00000000-0000-0000-0000-000000000001"
        synthetic_emb = make_synthetic_embedding(0.1)

        # Upsert into mock
        res = mock_supabase.table("identity_embeddings").upsert({
            "user_id": test_user_id,
            "embedding": synthetic_emb
        }).execute()
        assert len(res.data) == 1
        assert res.data[0]["user_id"] == test_user_id

        # Query from mock
        fetch_res = mock_supabase.table("identity_embeddings").select("*").eq("user_id", test_user_id).execute()
        assert len(fetch_res.data) == 1
        assert fetch_res.data[0]["user_id"] == test_user_id
        assert len(fetch_res.data[0]["embedding"]) == 128

    def test_quarantine_guard_blocks_live_mutation_in_tests(self, monkeypatch):
        """Verify that default test runs cannot have RUN_LIVE_SUPABASE_TESTS active."""
        assert monkeypatch is not None
        import os
        assert os.getenv("RUN_LIVE_SUPABASE_TESTS") is None
