import httpx
import os
import sys

# Add backend to path to import server
sys.path.append(os.path.join(os.getcwd(), "backend"))
from server import SUPABASE_URL, SUPABASE_KEY

def sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

def wipe_table(table):
    print(f"Wiping table: {table}...")
    # Using the exact same pattern as sb_select/sb_delete in server.py
    # But PostgREST doesn't support bulk delete without filters easily.
    # We'll use a filter that matches all UUID-like or string-like IDs.
    # Since we don't know the exact IDs, we can use a 'not.eq' with a dummy value.
    
    url = f"{SUPABASE_URL}/rest/v1/{table}?or=(created_at.neq.1970-01-01,created_at.is.null)"
    r = httpx.delete(url, headers=sb_headers())
    
    if r.status_code >= 400:
        print(f"Failed to wipe {table}: {r.status_code} {r.text}")
    else:
        print(f"Successfully wiped {table}")

if __name__ == "__main__":
    print(f"Using URL: {SUPABASE_URL}")
    tables = ["leads", "visits", "bookings", "loans", "activities", "campaigns", "templates"]
    for t in tables:
        wipe_table(t)
    print("Wipe complete.")
