import re

correct_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2UiLCJyZWYiOiJ4bGFpd215eWxkeG14V2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

with open('backend/setup_supabase.py', 'r') as f:
    content = f.read()

new_content = re.sub(r'SERVICE_ROLE_KEY = ".*?"', f'SERVICE_ROLE_KEY = "{correct_key}"', content)

with open('backend/setup_supabase.py', 'w') as f:
    f.write(new_content)

print("Updated setup_supabase.py")
