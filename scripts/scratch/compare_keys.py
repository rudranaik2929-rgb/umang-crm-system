import re
import os

setup_file = os.path.join('backend', 'scripts', 'setup_supabase.py')
get_users_file = os.path.join('scripts', 'scratch', 'get_users.py')

with open(setup_file, 'r') as f:
    setup_content = f.read()
    setup_key = re.search(r'SERVICE_ROLE_KEY = "(.*?)"', setup_content).group(1)

with open(get_users_file, 'r') as f:
    get_users_content = f.read()
    get_users_key = re.search(r'key = "(.*?)"', get_users_content).group(1)

print(f"Setup key: {setup_key}")
print(f"Get users key: {get_users_key}")
print(f"Are they equal? {setup_key == get_users_key}")

if setup_key != get_users_key:
    print("They are DIFFERENT!")
    # Show where they differ
    for i, (c1, c2) in enumerate(zip(setup_key, get_users_key)):
        if c1 != c2:
            print(f"First difference at index {i}: '{c1}' vs '{c2}'")
            break
