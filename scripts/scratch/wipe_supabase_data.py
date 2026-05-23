import httpx
import os

SUPABASE_URL = "https://xlaiwmyyldxmuvopqomi.supabase.co"
SUPABASE_KEY = ""

def sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

def wipe_table(table):
    print(f"Wiping table: {table}...")
    # Supabase/PostgREST delete with no filter deletes everything if allowed
    # We use a filter that matches everything to be safe
    r = httpx.delete(f"{SUPABASE_URL}/rest/v1/{table}?or=(status.neq.dummy,status.eq.dummy)", headers=sb_headers())
    # If that doesn't work (PostgREST might require a filter), we can try other ways.
    # Actually, if there's no filter it might fail. Let's use a filter on a column that exists.
    
    # Try filtering by a column that is common.
    # Most tables have 'created_at'.
    r = httpx.delete(f"{SUPABASE_URL}/rest/v1/{table}?created_at=neq.1970-01-01", headers=sb_headers())
    
    if r.status_code >= 400:
        print(f"Failed to wipe {table}: {r.status_code} {r.text}")
    else:
        print(f"Successfully wiped {table}")

if __name__ == "__main__":
    tables = ["leads", "visits", "bookings", "loans", "activities", "campaigns", "templates"]
    for t in tables:
        wipe_table(t)
    print("Wipe complete.")
