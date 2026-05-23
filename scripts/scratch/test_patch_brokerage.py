import httpx
key = ""
url = "https://xlaiwmyyldxmuvopqomi.supabase.co/rest/v1/bookings"
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}
# First, get a booking ID
r = httpx.get(url + "?limit=1", headers=headers)
if r.status_code == 200 and r.json():
    bid = r.json()[0]['booking_id']
    print("Found booking:", bid)
    # Try to patch it
    patch_r = httpx.patch(url + f"?booking_id=eq.{bid}", headers=headers, json={"brokerage_amount": 123.0})
    print("Patch status:", patch_r.status_code)
    print("Patch response:", patch_r.text)
else:
    print("No bookings found or error", r.status_code, r.text)
