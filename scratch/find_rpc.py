import httpx
import re

with open('scratch/get_users.py', 'r') as f:
    key = re.search(r'key = "(.*?)"', f.read()).group(1)

# We can't query information_schema via REST unless it's exposed.
# But we can try to find the RPC function name by trial and error or by looking at common names.
# Wait! I'll check if there's any file in the repo that CREATES the RPC function.
