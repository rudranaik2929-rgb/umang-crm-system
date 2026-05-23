import os
import re
import subprocess

# Extract key from get_users.py
with open('scripts/scratch/get_users.py', 'r') as f:
    key = re.search(r'key = "(.*?)"', f.read()).group(1)

# Set env var
os.environ['SUPABASE_ANON_KEY'] = key

# Run uvicorn
# We use subprocess.run so we can see output if it fails immediately
# But wait, we want it in background. 
# Actually, I'll just run it synchronously for a bit to see if it starts.
print(f"Starting server with key: {key[:10]}...")
subprocess.run(['uvicorn', 'backend.server:app', '--port', '8000', '--host', '0.0.0.0'])
