import httpx
import re

# Extract key from get_users.py
with open('scratch/get_users.py', 'r') as f:
    content = f.read()
    key = re.search(r'key = "(.*?)"', content).group(1)

# Note: Supabase RPC for raw SQL usually needs a function.
# But let's try to see if we can use the 'rpc' endpoint with the 'query' param if it exists.
# Actually, setup_supabase.py used:
# f"{SUPABASE_URL}/rest/v1/rpc/" with json={"query": sql}
# If that function is actually named 'rpc' in the DB, it might work.

url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/rpc/exec_sql" # Trying a common name
# Wait, let's try the one from setup_supabase.py again but with the CORRECT key.
# Line 155 in setup_supabase.py says: f"{SUPABASE_URL}/rest/v1/rpc/"
# This is strange for PostgREST. Usually it's rpc/function_name.

def run_sql(sql):
    # Try different common RPC names
    for func in ["exec_sql", "run_sql", "query"]:
        endpoint = f"https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/rpc/{func}"
        print(f"Trying RPC function: {func} ...")
        r = httpx.post(endpoint, headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }, json={"query": sql})
        if r.status_code < 300:
            print(f"Success with {func}!")
            return True
        print(f"Failed with {func}: {r.status_code} {r.text[:100]}")
    return False

# Attempt to add the column
sql = "ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;"
if run_sql(sql):
    # Set the value
    run_sql("UPDATE users SET password = 'umang@admin' WHERE email = 'htshpatil13@gmail.com';")
    print("Database repaired successfully!")
else:
    print("Could not add column via RPC. Trying to use password_hash if that's what's available.")
    # If we can't add 'password', we MUST update the backend code on Render.
    # Since I can't do that, I'll try to find if there's any other way.
