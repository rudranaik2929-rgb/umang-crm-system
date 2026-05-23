import re

correct_key = ""

with open('backend/scripts/setup_supabase.py', 'r') as f:
    content = f.read()

new_content = re.sub(r'SERVICE_ROLE_KEY = ".*?"', f'SERVICE_ROLE_KEY = "{correct_key}"', content)

with open('backend/scripts/setup_supabase.py', 'w') as f:
    f.write(new_content)

print("Updated setup_supabase.py")
