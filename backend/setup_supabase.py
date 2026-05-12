"""Create Supabase tables via the PostgREST RPC endpoint."""
import httpx, json, sys

SUPABASE_URL = "https://xlaiwmyyldxmuvopqomi.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2UiLCJyZWYiOiJ4bGFpd215eWxkeG14V2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

# Each SQL statement separately
SQLS = [
    # leads
    """CREATE TABLE IF NOT EXISTS leads (
        lead_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        budget TEXT,
        location TEXT,
        property_type TEXT,
        notes TEXT,
        source TEXT DEFAULT 'website',
        stage TEXT DEFAULT 'new',
        status TEXT DEFAULT 'active',
        assigned_to TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );""",
    # activities
    """CREATE TABLE IF NOT EXISTS activities (
        activity_id TEXT PRIMARY KEY,
        lead_id TEXT,
        user_id TEXT,
        type TEXT,
        text TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
    );""",
    # visits
    """CREATE TABLE IF NOT EXISTS visits (
        visit_id TEXT PRIMARY KEY,
        lead_id TEXT,
        scheduled_at TIMESTAMPTZ,
        assigned_to TEXT,
        status TEXT DEFAULT 'scheduled',
        feedback TEXT,
        interested BOOLEAN,
        created_at TIMESTAMPTZ DEFAULT now()
    );""",
    # bookings
    """CREATE TABLE IF NOT EXISTS bookings (
        booking_id TEXT PRIMARY KEY,
        lead_id TEXT,
        lead_name TEXT,
        property_name TEXT,
        booking_amount NUMERIC DEFAULT 0,
        token_received NUMERIC DEFAULT 0,
        agreement_status TEXT DEFAULT 'pending',
        payment_progress INT DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT now()
    );""",
    # loans
    """CREATE TABLE IF NOT EXISTS loans (
        loan_id TEXT PRIMARY KEY,
        lead_id TEXT,
        lead_name TEXT,
        amount NUMERIC DEFAULT 0,
        bank_name TEXT,
        application_status TEXT DEFAULT 'pending',
        bank_stage TEXT DEFAULT 'documentation',
        emi_eligible NUMERIC,
        progress INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
    );""",
    # templates
    """CREATE TABLE IF NOT EXISTS templates (
        template_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
    );""",
    # campaigns
    """CREATE TABLE IF NOT EXISTS campaigns (
        campaign_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        template_id TEXT,
        audience TEXT DEFAULT 'all',
        scheduled_at TIMESTAMPTZ,
        status TEXT DEFAULT 'draft',
        sent_count INT DEFAULT 0,
        delivered_count INT DEFAULT 0,
        read_count INT DEFAULT 0,
        replied_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
    );""",
    # Seed admin user
    """INSERT INTO users (user_id, email, name, role)
       VALUES ('user_admin001', 'htshpatil13@gmail.com', 'Umang Home Tech', 'admin')
       ON CONFLICT (user_id) DO NOTHING;""",
    # Seed demo employees
    """INSERT INTO employees (employee_id, name, email, phone, role, department)
       VALUES
         ('emp_sales01', 'Demo Sales', 'sales@umang.com', '9876500000', 'telecaller', 'Sales'),
         ('emp_field01', 'Demo Field', 'field@umang.com', '9876500000', 'site_visit', 'Field'),
         ('emp_ops01', 'Demo Operations', 'ops@umang.com', '9876500000', 'booking', 'Operations'),
         ('emp_fin01', 'Demo Finance', 'finance@umang.com', '9876500000', 'loan', 'Finance')
       ON CONFLICT (employee_id) DO NOTHING;""",
]

TABLE_NAMES = ["leads", "activities", "visits", "bookings", "loans", "templates", "campaigns", "seed:users", "seed:employees"]

client = httpx.Client(timeout=30)

for i, sql in enumerate(SQLS):
    label = TABLE_NAMES[i]
    print(f"[{i+1}/{len(SQLS)}] Running: {label} ... ", end="", flush=True)
    try:
        resp = client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/",
            headers=HEADERS,
            json={"query": sql},
        )
        if resp.status_code < 300:
            print("OK")
        else:
            # Try the SQL endpoint instead
            resp2 = client.post(
                f"{SUPABASE_URL}/pg/query",
                headers=HEADERS,
                json={"query": sql},
            )
            if resp2.status_code < 300:
                print("OK (via pg)")
            else:
                print(f"Status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"ERROR: {e}")

print("\nDone! Verifying tables...")

# Verify by listing tables
verify_sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
try:
    # Try direct REST query
    for table in ["users", "sessions", "employees", "leads", "activities", "visits", "bookings", "loans", "templates", "campaigns"]:
        resp = client.get(
            f"{SUPABASE_URL}/rest/v1/{table}?select=count",
            headers={**HEADERS, "Prefer": "count=exact"},
        )
        if resp.status_code == 200:
            count = resp.headers.get("content-range", "?")
            print(f"  ✓ {table:12s} exists (range: {count})")
        elif resp.status_code == 404:
            print(f"  ✗ {table:12s} NOT FOUND")
        else:
            print(f"  ? {table:12s} status={resp.status_code}")
except Exception as e:
    print(f"Verify error: {e}")
