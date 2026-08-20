"""
QUARANTINED / DEPRECATED LEGACY SMOKE TEST
==========================================
WARNING: This script is quarantined to prevent accidental mutations of shared or production Supabase data.
For safe, isolated unit and contract tests, run:
    pytest tests/unit/test_identity_contract.py

To run opt-in live Supabase integration tests against an isolated local/test database:
    set RUN_LIVE_SUPABASE_TESTS=1
    python identity_embedding_smoke_test.py
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Safety Gate: Refuse execution unless explicitly enabled for integration testing
if os.getenv("RUN_LIVE_SUPABASE_TESTS") != "1":
    print(
        "[QUARANTINE GUARD] Live Supabase smoke test is disabled by default to protect shared databases.\n"
        "To run in-memory tests: pytest tests/unit/test_identity_contract.py\n"
        "To explicitly enable: set RUN_LIVE_SUPABASE_TESTS=1 (requires non-production test URL)"
    )
    sys.exit(0)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("[ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")
    sys.exit(1)

# Prevent execution if pointing to known production domains without test flag
if "supabase.co" in SUPABASE_URL and not os.getenv("ALLOW_PRODUCTION_TEST"):
    print("[SAFETY VIOLATION] Refusing to run smoke test against remote Supabase instance without ALLOW_PRODUCTION_TEST=1.")
    sys.exit(1)

from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
test_user_id = os.getenv("TEST_USER_ID", "00000000-0000-0000-0000-000000000001")

try:
    res = supabase.table("identity_embeddings").upsert({
        "user_id": test_user_id,
        "embedding": [0.0] * 128
    }).execute()
    print("Success:", res)
except Exception as e:
    print("Error:", str(e))
    sys.exit(1)
