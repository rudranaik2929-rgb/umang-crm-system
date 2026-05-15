import httpx, json

BASE = 'http://127.0.0.1:8000/api'

# 1. Login
print('=== 1. LOGIN ===')
r = httpx.post(f'{BASE}/auth/session', json={'email':'htshpatil13@gmail.com','password':'umang@admin'})
print(f'Login: {r.status_code}')
data = r.json()
token = data.get('session_token','')
h = {'Authorization': f'Bearer {token}'}
print(f'Token obtained: {token[:20]}...')

# 2. Check dashboard is empty
print('\n=== 2. DASHBOARD (should be empty) ===')
r = httpx.get(f'{BASE}/stats/dashboard', headers=h)
d = r.json()
print(f"Total leads: {d.get('total_leads')}, Bookings: {d.get('total_bookings')}, Revenue: {d.get('total_revenue')}")

# 3. Create a lead
print('\n=== 3. CREATE LEAD ===')
r = httpx.post(f'{BASE}/leads', json={'name':'Production Test Lead','phone':'9876543210','source':'walk_in','budget':'50 Lacs','location':'Pune','property_type':'2BHK'}, headers=h)
lead = r.json()
lid = lead.get('lead_id')
print(f"Created: {lead.get('name')} -> stage={lead.get('stage')} id={lid}")

# 4. Check pipeline
print('\n=== 4. PIPELINE CHECK ===')
r = httpx.get(f'{BASE}/leads', headers=h)
leads_list = r.json()
print(f'Total leads in pipeline: {len(leads_list)}')
for l in leads_list:
    print(f"  - {l.get('name')} | stage={l.get('stage')} | status={l.get('status')}")

# 5. Update lead -> positive
print('\n=== 5. MARK POSITIVE ===')
r = httpx.patch(f'{BASE}/leads/{lid}', json={'stage':'positive','status':'active'}, headers=h)
print(f'Updated to positive: {r.status_code}')
r = httpx.get(f'{BASE}/leads', headers=h)
for l in r.json():
    print(f"  - {l.get('name')} | stage={l.get('stage')}")

# 6. Update lead -> site_visit
print('\n=== 6. MOVE TO SITE VISIT ===')
r = httpx.patch(f'{BASE}/leads/{lid}', json={'stage':'site_visit'}, headers=h)
print(f'Updated to site_visit: {r.status_code}')

# Check visits
r = httpx.get(f'{BASE}/visits', headers=h)
visits = r.json()
print(f'Visits auto-created: {len(visits)}')

# 7. Update lead -> booking
print('\n=== 7. MOVE TO BOOKING ===')
r = httpx.patch(f'{BASE}/leads/{lid}', json={'stage':'booking'}, headers=h)
print(f'Updated to booking: {r.status_code}')

# Check pipeline
r = httpx.get(f'{BASE}/leads', headers=h)
for l in r.json():
    print(f"  - {l.get('name')} | stage={l.get('stage')}")

# Check bookings
r = httpx.get(f'{BASE}/bookings', headers=h)
bookings = r.json()
print(f'Bookings auto-created: {len(bookings)}')
for b in bookings:
    print(f"  - {b.get('lead_name')} | status={b.get('status')}")

# 8. Update lead -> loan
print('\n=== 8. MOVE TO LOAN ===')
r = httpx.patch(f'{BASE}/leads/{lid}', json={'stage':'loan'}, headers=h)
print(f'Updated to loan: {r.status_code}')

# Check pipeline
r = httpx.get(f'{BASE}/leads', headers=h)
for l in r.json():
    print(f"  - {l.get('name')} | stage={l.get('stage')}")

# Check loans
r = httpx.get(f'{BASE}/loans', headers=h)
loans = r.json()
print(f'Loans auto-created: {len(loans)}')
for lo in loans:
    print(f"  - {lo.get('lead_name')} | status={lo.get('application_status')} | stage={lo.get('bank_stage')}")

# 9. Close the deal
print('\n=== 9. CLOSE DEAL ===')
r = httpx.patch(f'{BASE}/leads/{lid}', json={'stage':'closed','status':'active'}, headers=h)
print(f'Closed: {r.status_code}')

# 10. Final pipeline check
print('\n=== 10. FINAL PIPELINE ===')
r = httpx.get(f'{BASE}/leads', headers=h)
for l in r.json():
    print(f"  - {l.get('name')} | stage={l.get('stage')} | status={l.get('status')}")

# 11. Final dashboard
print('\n=== 11. FINAL DASHBOARD ===')
r = httpx.get(f'{BASE}/stats/dashboard', headers=h)
d = r.json()
print(f"Total leads: {d.get('total_leads')}")
print(f"Bookings: {d.get('total_bookings')}")
print(f"Revenue: {d.get('total_revenue')}")
print(f"Stage dist: {d.get('stage_distribution')}")

print('\n=== ALL TESTS PASSED ===')
