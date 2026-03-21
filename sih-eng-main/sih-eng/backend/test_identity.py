import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
try:
    res = supabase.table("identity_embeddings").upsert({"user_id": "893d56f1-db78-4351-a90f-d128dc1c7b8d", "embedding": [0.0]*128}).execute()
    print("Success:", res)
except Exception as e:
    print("Error:", str(e))
