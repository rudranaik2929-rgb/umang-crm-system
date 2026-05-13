"""Umang Properties – Real Estate CRM Backend (Supabase Production)"""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
import uuid, logging, random, os, httpx
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

app = FastAPI(title="Umang Properties CRM")

@app.get("/")
async def root_health():
    return {"status": "online", "message": "Umang CRM Backend is running", "timestamp": datetime.now().isoformat()}

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://umang-home-tech.vercel.app",
        "http://localhost:8081",
        "http://localhost:19006",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api_router = APIRouter(prefix="/api")

STAGES = ["new","contacted","positive","site_visit","booking","loan","registration","closed"]
ROLES = ["admin","telecaller","site_visit","booking","loan","marketing"]

# ---- Supabase Config ----
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xlaiwmyyldxmuvopqomi.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

def sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

def sb_url(table: str) -> str:
    return f"{SUPABASE_URL}/rest/v1/{table}"

_http = httpx.Client(timeout=15)

def sb_select(table, params=None):
    r = _http.get(sb_url(table), headers=sb_headers(), params=params or {})
    if r.status_code >= 400:
        logging.error(f"Supabase SELECT {table}: {r.status_code} {r.text[:300]}")
    return r.json() if r.status_code < 400 else []

def sb_insert(table, data):
    r = _http.post(sb_url(table), headers=sb_headers(), json=data)
    if r.status_code >= 400:
        logging.error(f"Supabase INSERT {table}: {r.status_code} {r.text[:300]}")
        return None
    rows = r.json()
    return rows[0] if isinstance(rows, list) and rows else rows

def sb_update(table, pk_col, pk_val, data):
    h = {**sb_headers(), "Prefer": "return=representation"}
    r = _http.patch(f"{sb_url(table)}?{pk_col}=eq.{pk_val}", headers=h, json=data)
    if r.status_code >= 400:
        logging.error(f"Supabase UPDATE {table}: {r.status_code} {r.text[:300]}")
        return None
    rows = r.json()
    return rows[0] if isinstance(rows, list) and rows else rows

def sb_delete(table, pk_col, pk_val):
    r = _http.delete(f"{sb_url(table)}?{pk_col}=eq.{pk_val}", headers=sb_headers())
    return r.status_code < 400

def now_utc(): return datetime.now(timezone.utc)
def gen_id(p="id"): return f"{p}_{uuid.uuid4().hex[:12]}"

# ---- Pydantic Models ----
class User(BaseModel):
    user_id: str; email: str; name: str; picture: Optional[str]=None
    role: Optional[str]=None; acting_as_employee_id: Optional[str]=None; created_at: datetime
class RoleSet(BaseModel): role: str
class ActAs(BaseModel): employee_id: Optional[str]=None
class LeadCreatePublic(BaseModel):
    name: str; phone: str; email: Optional[str]=None; budget: Optional[str]=None
    location: Optional[str]=None; property_type: Optional[str]=None; notes: Optional[str]=None
class LeadUpdate(BaseModel):
    stage: Optional[str]=None; status: Optional[str]=None; assigned_to: Optional[str]=None
    phone: Optional[str]=None; email: Optional[str]=None; budget: Optional[str]=None
    location: Optional[str]=None; property_type: Optional[str]=None; notes: Optional[str]=None
class NoteCreate(BaseModel): text: str; type: str="call_note"
class SiteVisitCreate(BaseModel): lead_id: str; scheduled_at: datetime; assigned_to: Optional[str]=None
class SiteVisitUpdate(BaseModel):
    status: Optional[str]=None; feedback: Optional[str]=None; interested: Optional[bool]=None
class BookingCreate(BaseModel): lead_id: str; property_name: str; booking_amount: float; token_received: float=0
class BookingUpdate(BaseModel):
    token_received: Optional[float]=None; agreement_status: Optional[str]=None; status: Optional[str]=None
class LoanCreate(BaseModel): lead_id: str; amount: float; bank_name: Optional[str]=None
class LoanUpdate(BaseModel):
    bank_name: Optional[str]=None; application_status: Optional[str]=None; progress: Optional[int]=None
class EmployeeCreate(BaseModel): name: str; email: str; phone: Optional[str]=None; role: str; department: str
class EmployeeUpdate(BaseModel):
    name: Optional[str]=None; phone: Optional[str]=None; role: Optional[str]=None; active: Optional[bool]=None
class TemplateCreate(BaseModel): name: str; body: str
class CampaignCreate(BaseModel):
    name: str; template_id: Optional[str]=None; audience: str="all"; scheduled_at: Optional[datetime]=None

# ---- Auth Helpers ----
async def get_session_token(request: Request):
    t = request.cookies.get("session_token")
    if t: return t
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "): return auth[7:]
    return None

async def get_current_user(request: Request) -> User:
    token = await get_session_token(request)
    if not token: raise HTTPException(401, "Not authenticated")
    rows = sb_select("sessions", {"session_token": f"eq.{token}", "select": "*"})
    if not rows: raise HTTPException(401, "Invalid session")
    sess = rows[0]
    exp = sess.get("expires_at", "")
    if exp and datetime.fromisoformat(exp.replace("Z","+00:00")) <= now_utc():
        raise HTTPException(401, "Session expired")
    users = sb_select("users", {"user_id": f"eq.{sess['user_id']}", "select": "*"})
    if not users: raise HTTPException(401, "User not found")
    return User(**users[0])

# ---- Auth Endpoints ----
@api_router.post("/auth/session")
async def auth_session(request: Request, response: Response):
    body = await request.json()
    email, password = body.get("email"), body.get("password")
    
    # Query real users table
    users = sb_select("users", {"email": f"eq.{email}", "select": "*"})
    if not users:
        raise HTTPException(401, "Invalid email or password")
    
    u = users[0]
    if u.get("password") != password: # In production, use bcrypt/argon2 hashing
        raise HTTPException(401, "Invalid email or password")
    
    uid = u["user_id"]
    token = gen_id("sess")
    sb_insert("sessions", {
        "session_token": token,
        "user_id": uid,
        "created_at": now_utc().isoformat(),
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
    })
    
    # Set secure cookie
    response.set_cookie(
        key="session_token", value=token, 
        max_age=604800, httponly=True, 
        samesite="none", path="/", secure=True
    )
    
    return {"user": User(**u).model_dump(mode="json"), "session_token": token}

@api_router.get("/auth/me")
async def auth_me(cu: User = Depends(get_current_user)):
    return cu.model_dump(mode="json")

@api_router.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    t = await get_session_token(request)
    if t:
        sb_delete("sessions", "session_token", t)
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

@api_router.post("/auth/set-role")
async def auth_set_role(payload: RoleSet, cu: User = Depends(get_current_user)):
    if payload.role not in ROLES: raise HTTPException(400, "Invalid role")
    updated = sb_update("users", "user_id", cu.user_id, {"role": payload.role})
    if not updated: raise HTTPException(500, "Failed to update role")
    return User(**updated).model_dump(mode="json")

@api_router.post("/auth/ping-location")
async def ping_location(request: Request, cu: User=Depends(get_current_user)):
    body = await request.json()
    lat, lng = body.get("lat"), body.get("lng")
    if lat is None or lng is None: return {"ok": False}
    
    # Update employee record if linked
    if cu.employee_id:
        sb_update("employees", "employee_id", cu.employee_id, {
            "last_lat": lat,
            "last_lng": lng,
            "last_seen_at": now_utc().isoformat()
        })
    return {"ok": True}

@api_router.post("/auth/act-as")
async def auth_act_as(payload: ActAs, cu: User = Depends(get_current_user)):
    updated = sb_update("users", "user_id", cu.user_id, {"acting_as_employee_id": payload.employee_id})
    if not updated: raise HTTPException(500, "Failed to update")
    return User(**updated).model_dump(mode="json")

# ---- Activity Logger ----
def log_activity(actor, type_, text, lead_id=None): 
    user_id_to_log = None
    actor_name = "System"
    
    if actor:
        user_id_to_log = actor.acting_as_employee_id or actor.user_id
        actor_name = actor.name

    # Check if they are acting as an employee
    if actor and actor.acting_as_employee_id:
        emps = sb_select("employees", {"employee_id": f"eq.{actor.acting_as_employee_id}", "select": "name"})
        if emps:
            actor_name = emps[0]["name"]

    act = {
        "activity_id": gen_id("act"),
        "lead_id": lead_id,
        "user_id": user_id_to_log,
        "type": type_,
        "text": f"[{actor_name}] {text}",
        "created_at": now_utc().isoformat(),
    }
    sb_insert("activities", act)
    return act

# ---- Leads ----
@api_router.post("/leads/public")
async def create_lead_public(p: LeadCreatePublic):
    lid = gen_id("lead")
    lead = {
        "lead_id": lid, "name": p.name, "phone": p.phone, "email": p.email,
        "budget": p.budget, "location": p.location, "property_type": p.property_type,
        "notes": p.notes, "source": "website", "stage": "new", "status": "active",
        "assigned_to": None, "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
    }
    result = sb_insert("leads", lead)
    log_activity(None, "website_enquiry", f"New website enquiry received from {p.name}.", lead_id=lid)
    return result or lead

@api_router.post("/leads")
async def create_lead(p: LeadCreatePublic, cu: User=Depends(get_current_user)):
    lid = gen_id("lead")
    lead = {
        "lead_id": lid, "name": p.name, "phone": p.phone, "email": p.email,
        "budget": p.budget, "location": p.location, "property_type": p.property_type,
        "notes": p.notes, "source": "manual_entry", "stage": "new", "status": "active",
        "assigned_to": None, "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
    }
    result = sb_insert("leads", lead)
    log_activity(cu, "manual_enquiry", f"Manual lead entry created for {p.name}.", lead_id=lid)
    return result or lead

@api_router.get("/leads")
async def list_leads(stage: Optional[str]=None, status_: Optional[str]=None, assigned_to: Optional[str]=None, cu: User=Depends(get_current_user)):
    params = {"select": "*", "order": "created_at.desc"}
    if stage: params["stage"] = f"eq.{stage}"
    if status_: params["status"] = f"eq.{status_}"
    if assigned_to: params["assigned_to"] = f"eq.{assigned_to}"
    return sb_select("leads", params)

@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": "*"})
    if not leads: raise HTTPException(404, "Lead not found")
    timeline = sb_select("activities", {"lead_id": f"eq.{lead_id}", "select": "*", "order": "created_at.desc"})
    return {"lead": leads[0], "timeline": timeline}

@api_router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, p: LeadUpdate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": "*"})
    if not leads: raise HTTPException(404, "Lead not found")
    old_lead = leads[0]
    
    data = {k: v for k, v in p.model_dump().items() if v is not None}
    data["updated_at"] = now_utc().isoformat()
    updated = sb_update("leads", "lead_id", lead_id, data)
    if not updated: raise HTTPException(404, "Lead not found")
    
    # Log activity for stage/status changes
    if p.stage and p.stage != old_lead.get("stage"):
        act_type = f"stage_change_{p.stage}"
        if p.stage == "positive": act_type = "positive_response"
        log_activity(cu, act_type, f"Moved lead stage from {old_lead.get('stage')} to {p.stage}", lead_id=lead_id)
    
    if p.status and p.status != old_lead.get("status"):
        act_type = f"status_change_{p.status}"
        if p.status == "negative": act_type = "negative_response"
        log_activity(cu, act_type, f"Changed lead status from {old_lead.get('status')} to {p.status}", lead_id=lead_id)
        
    return updated

@api_router.post("/leads/{lead_id}/notes")
async def add_lead_note(lead_id: str, p: NoteCreate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": "lead_id"})
    if not leads: raise HTTPException(404, "Lead not found")
    return log_activity(cu, p.type, p.text, lead_id=lead_id)

@api_router.post("/leads/{lead_id}/advance")
async def advance_lead(lead_id: str, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": "*"})
    if not leads: raise HTTPException(404, "Lead not found")
    lead = leads[0]
    cur = lead.get("stage", "new")
    try: idx = STAGES.index(cur)
    except: idx = 0
    if idx >= len(STAGES) - 1: return lead
    new_stage = STAGES[idx + 1]
    updated = sb_update("leads", "lead_id", lead_id, {"stage": new_stage, "updated_at": now_utc().isoformat()})
    log_activity(cu, "stage_change", f"Stage moved {cur} → {new_stage}", lead_id=lead_id)
    return updated or lead

# ---- Visits ----
@api_router.post("/visits")
async def create_visit(p: SiteVisitCreate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{p.lead_id}", "select": "lead_id,name"})
    if not leads: raise HTTPException(404, "Lead not found")
    vid = gen_id("vis")
    v = {
        "visit_id": vid, "lead_id": p.lead_id, "scheduled_at": p.scheduled_at.isoformat(),
        "assigned_to": p.assigned_to, "status": "scheduled", "feedback": None,
        "interested": None, "created_at": now_utc().isoformat(),
    }
    result = sb_insert("visits", v)
    return result or v

@api_router.get("/visits")
async def list_visits(cu: User=Depends(get_current_user)):
    return sb_select("visits", {"select": "*", "order": "scheduled_at.desc"})

@api_router.patch("/visits/{visit_id}")
async def update_visit(visit_id: str, p: SiteVisitUpdate, cu: User=Depends(get_current_user)):
    data = {k: v for k, v in p.model_dump().items() if v is not None}
    updated = sb_update("visits", "visit_id", visit_id, data)
    if not updated: raise HTTPException(404, "Visit not found")
    return updated

# ---- Bookings ----
@api_router.post("/bookings")
async def create_booking(p: BookingCreate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{p.lead_id}", "select": "lead_id,name"})
    if not leads: raise HTTPException(404, "Lead not found")
    bid = gen_id("bkg")
    b = {
        "booking_id": bid, "lead_id": p.lead_id, "lead_name": leads[0]["name"],
        "property_name": p.property_name, "booking_amount": p.booking_amount,
        "token_received": p.token_received, "agreement_status": "pending",
        "payment_progress": int((p.token_received / p.booking_amount) * 100) if p.booking_amount else 0,
        "status": "active", "created_at": now_utc().isoformat(),
    }
    result = sb_insert("bookings", b)
    return result or b

@api_router.get("/bookings")
async def list_bookings(cu: User=Depends(get_current_user)):
    return sb_select("bookings", {"select": "*", "order": "created_at.desc"})

@api_router.patch("/bookings/{booking_id}")
async def update_booking(booking_id: str, p: BookingUpdate, cu: User=Depends(get_current_user)):
    data = {k: v for k, v in p.model_dump().items() if v is not None}
    updated = sb_update("bookings", "booking_id", booking_id, data)
    if not updated: raise HTTPException(404, "Booking not found")
    return updated

# ---- Loans ----
@api_router.post("/loans")
async def create_loan(p: LoanCreate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{p.lead_id}", "select": "lead_id,name"})
    if not leads: raise HTTPException(404, "Lead not found")
    lid = gen_id("lon")
    l = {
        "loan_id": lid, "lead_id": p.lead_id, "lead_name": leads[0]["name"],
        "bank_name": p.bank_name, "amount": p.amount, "application_status": "pending",
        "bank_stage": "documentation", "emi_eligible": None, "progress": 0,
        "created_at": now_utc().isoformat(),
    }
    result = sb_insert("loans", l)
    return result or l

@api_router.get("/loans")
async def list_loans(cu: User=Depends(get_current_user)):
    return sb_select("loans", {"select": "*", "order": "created_at.desc"})

@api_router.patch("/loans/{loan_id}")
async def update_loan(loan_id: str, p: LoanUpdate, cu: User=Depends(get_current_user)):
    data = {k: v for k, v in p.model_dump().items() if v is not None}
    updated = sb_update("loans", "loan_id", loan_id, data)
    if not updated: raise HTTPException(404, "Loan not found")
    return updated

# ---- Employees ----
@api_router.post("/employees")
async def create_employee(p: EmployeeCreate, cu: User=Depends(get_current_user)):
    eid = gen_id("emp")
    e = {
        "employee_id": eid, "name": p.name, "email": p.email, "phone": p.phone,
        "role": p.role, "department": p.department, "active": True,
        "leads_assigned": 0, "leads_closed": 0, "last_login": None,
        "created_at": now_utc().isoformat(),
    }
    result = sb_insert("employees", e)
    return result or e

@api_router.get("/employees")
async def list_employees(cu: User=Depends(get_current_user)):
    return sb_select("employees", {"select": "*", "order": "created_at.desc"})

@api_router.patch("/employees/{eid}")
async def update_employee(eid: str, p: EmployeeUpdate, cu: User=Depends(get_current_user)):
    data = {k: v for k, v in p.model_dump().items() if v is not None}
    updated = sb_update("employees", "employee_id", eid, data)
    if not updated: raise HTTPException(404, "Employee not found")
    return updated

@api_router.delete("/employees/{eid}")
async def delete_employee(eid: str, cu: User=Depends(get_current_user)):
    sb_delete("employees", "employee_id", eid)
    return {"ok": True}

# ---- Templates & Campaigns ----
@api_router.post("/templates")
async def create_template(p: TemplateCreate, cu: User=Depends(get_current_user)):
    tid = gen_id("tpl")
    t = {"template_id": tid, "name": p.name, "body": p.body, "created_at": now_utc().isoformat()}
    result = sb_insert("templates", t)
    return result or t

@api_router.get("/templates")
async def list_templates(cu: User=Depends(get_current_user)):
    return sb_select("templates", {"select": "*", "order": "created_at.desc"})

@api_router.delete("/templates/{tid}")
async def delete_template(tid: str, cu: User=Depends(get_current_user)):
    sb_delete("templates", "template_id", tid)
    return {"ok": True}

@api_router.post("/campaigns")
async def create_campaign(p: CampaignCreate, cu: User=Depends(get_current_user)):
    cid = gen_id("cmp")
    c = {
        "campaign_id": cid, "name": p.name, "template_id": p.template_id,
        "audience": p.audience,
        "scheduled_at": p.scheduled_at.isoformat() if p.scheduled_at else None,
        "status": "draft", "sent_count": 0, "delivered_count": 0,
        "read_count": 0, "replied_count": 0, "created_at": now_utc().isoformat(),
    }
    result = sb_insert("campaigns", c)
    return result or c

@api_router.get("/campaigns")
async def list_campaigns(cu: User=Depends(get_current_user)):
    return sb_select("campaigns", {"select": "*", "order": "created_at.desc"})

@api_router.post("/campaigns/{cid}/send")
async def send_campaign(cid: str, cu: User=Depends(get_current_user)):
    camps = sb_select("campaigns", {"campaign_id": f"eq.{cid}", "select": "*"})
    if not camps: raise HTTPException(404, "Campaign not found")
    leads = sb_select("leads", {"select": "lead_id"})
    cnt = len(leads)
    data = {"status": "sent", "sent_count": cnt, "delivered_count": int(cnt * 0.95),
            "read_count": int(cnt * 0.7), "replied_count": int(cnt * 0.2)}
    updated = sb_update("campaigns", "campaign_id", cid, data)
    return updated or {**camps[0], **data}

@api_router.delete("/campaigns/{cid}")
async def delete_campaign(cid: str, cu: User=Depends(get_current_user)):
    sb_delete("campaigns", "campaign_id", cid)
    return {"ok": True}

# ---- Stats / Dashboard ----
@api_router.get("/stats/dashboard")
async def stats_dashboard(cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"select": "*"})
    stage_dist = {s: 0 for s in STAGES}
    for l in leads:
        if l.get("status") != "negative":
            st = l.get("stage", "new")
            stage_dist[st] = stage_dist.get(st, 0) + 1
    bookings = sb_select("bookings", {"select": "booking_amount,status"})
    visits = sb_select("visits", {"select": "visit_id,status"})
    loans = sb_select("loans", {"select": "loan_id,application_status"})
    employees = sb_select("employees", {"select": "employee_id"})
    campaigns = sb_select("campaigns", {"select": "campaign_id"})
    rev = sum(float(b.get("booking_amount", 0) or 0) for b in bookings)
    return {
        "total_leads": len(leads),
        "positive_leads": sum(1 for l in leads if l.get("stage") in ["positive","site_visit","booking","loan","registration","closed"]),
        "negative_leads": sum(1 for l in leads if l.get("status") == "negative"),
        "new_leads": sum(1 for l in leads if l.get("stage") == "new"),
        "site_visits": len(visits),
        "completed_visits": sum(1 for v in visits if v.get("status") == "completed"),
        "bookings": len(bookings),
        "confirmed_bookings": sum(1 for b in bookings if b.get("status") == "confirmed"),
        "loans": len(loans),
        "disbursed_loans": sum(1 for l in loans if l.get("application_status") == "disbursed"),
        "employees": len(employees),
        "campaigns": len(campaigns),
        "revenue_pipeline": rev,
        "stage_distribution": stage_dist,
    }

@api_router.get("/stats/leads-by-source")
async def stats_leads_by_source(cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"select": "source,stage,status,created_at"})
    source_map: dict = {}
    for l in leads:
        src = (l.get("source") or "direct").strip().lower()
        if src not in source_map:
            source_map[src] = {"source": src, "count": 0, "active": 0, "negative": 0}
        source_map[src]["count"] += 1
        if l.get("status") == "negative":
            source_map[src]["negative"] += 1
        else:
            source_map[src]["active"] += 1
    result = sorted(source_map.values(), key=lambda x: x["count"], reverse=True)
    return {"total": len(leads), "sources": result}

@api_router.get("/stats/dashboard/graph")
async def stats_dashboard_graph(cu: User=Depends(get_current_user)):
    # 1. Real leads per day (last 30 days)
    now = now_utc()
    start_date = (now - timedelta(days=30)).isoformat()
    leads = sb_select("leads", {"select": "created_at", "created_at": f"gte.{start_date}"})
    
    leads_by_day = []
    days_map = {}
    for i in range(30):
        d = (now - timedelta(days=29 - i)).strftime("%Y-%m-%d")
        days_map[d] = 0
    
    for l in leads:
        d = l.get("created_at", "")[:10]
        if d in days_map:
            days_map[d] += 1
            
    for d, cnt in sorted(days_map.items()):
        leads_by_day.append({"date": d, "count": cnt})

    # 2. Real revenue by month (last 12 months)
    bookings = sb_select("bookings", {"select": "booking_amount,created_at", "status": "eq.confirmed"})
    rev_by_month = []
    months_map = {}
    for i in range(12):
        d = (now - timedelta(days=(11 - i) * 30)).strftime("%Y-%m")
        months_map[d] = 0.0
        
    for b in bookings:
        d = b.get("created_at", "")[:7]
        if d in months_map:
            val = float(b.get("booking_amount", 0) or 0)
            months_map[d] += val
            
    for d, rev in sorted(months_map.items()):
        rev_by_month.append({"month": d, "revenue": rev})

    return {"leads_by_day": leads_by_day, "revenue_by_month": rev_by_month}

@api_router.get("/activities")
async def list_activities(limit: int = 50, cu: User=Depends(get_current_user)):
    return sb_select("activities", {"select": "*", "order": "created_at.desc", "limit": str(limit)})

@api_router.get("/stats/me")
async def stats_me(cu: User=Depends(get_current_user)):
    eid = cu.acting_as_employee_id or cu.user_id
    
    # Get personal stats
    activities = sb_select("activities", {"user_id": f"eq.{eid}", "select": "*", "order": "created_at.desc"})
    
    positives = sum(1 for a in activities if a.get("type") == "positive_response" or "positive" in str(a.get("type")))
    visits = sum(1 for a in activities if a.get("type") == "site_visit_scheduled" or "visit" in str(a.get("type")))
    bookings_done = sum(1 for a in activities if "booking" in str(a.get("type")))
    loans_done = sum(1 for a in activities if "loan" in str(a.get("type")))
    closed_deals = sum(1 for a in activities if "closed" in str(a.get("type")))
    
    # Calculate performance score (max 10)
    score = min(10, positives * 1 + visits * 2 + bookings_done * 3 + loans_done * 2 + closed_deals * 4)
    if not activities:
        score = 0
    
    # Get all leads for pipeline counts
    leads = sb_select("leads", {"select": "stage,status"})
    hot = sum(1 for l in leads if l.get("stage") in ["positive","site_visit","booking","loan","registration"])
    warm = sum(1 for l in leads if l.get("stage") == "contacted")
    cold = sum(1 for l in leads if l.get("stage") == "new")
    negative = sum(1 for l in leads if l.get("status") == "negative")
    closed = sum(1 for l in leads if l.get("stage") == "closed")

    return {
        "employee": None, "role": cu.role,
        "personal": {
            "actions_total": len(activities), "positives": positives, "negatives": 0, "followups": 0,
            "visits": visits, "bookings_done": bookings_done, "loans_done": loans_done, "closed_deals": closed_deals,
            "call_notes": sum(1 for a in activities if "call" in str(a.get("type"))), 
            "score_10": score, "last_activity": activities[0]["created_at"] if activities else None
        },
        "leads": {"hot": hot, "warm": warm, "cold": cold, "negative": negative, "closed": closed},
        "recent_activities": activities[:15]
    }

@api_router.get("/stats/employees")
async def stats_employees(cu: User=Depends(get_current_user)):
    employees = sb_select("employees", {"select": "*"})
    activities = sb_select("activities", {"select": "user_id,created_at,type"})
    
    # Calculate stats per employee
    emp_stats = []
    for e in employees:
        eid = e["employee_id"]
        emp_acts = [a for a in activities if a.get("user_id") == eid]
        
        last_activity = max([a["created_at"] for a in emp_acts]) if emp_acts else None
        actions_total = len(emp_acts)
        
        # Simple counts based on activity types
        positives = sum(1 for a in emp_acts if a.get("type") == "positive_response" or "positive" in str(a.get("type")))
        visits = sum(1 for a in emp_acts if a.get("type") == "site_visit_scheduled" or "visit" in str(a.get("type")))
        
        emp_stats.append({
            "employee_id": eid, "name": e["name"], "email": e["email"],
            "role": e["role"], "department": e.get("department", ""),
            "actions_total": actions_total, "last_activity": last_activity,
            "positives": positives, "negatives": 0,
            "followups": 0, "visits": visits,
            "bookings_done": sum(1 for a in emp_acts if "booking" in str(a.get("type"))), 
            "loans_done": sum(1 for a in emp_acts if "loan" in str(a.get("type"))),
            "closed_deals": sum(1 for a in emp_acts if "closed" in str(a.get("type"))), 
            "call_notes": sum(1 for a in emp_acts if "call" in str(a.get("type"))),
        })
    return emp_stats

# ---- Health & Wiring ----
@api_router.get("/")
async def root(): return {"app": "Umang Properties CRM", "status": "ok", "database": "supabase"}

app.include_router(api_router)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
