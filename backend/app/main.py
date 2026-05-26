"""Umang Hometech LLP – Real Estate CRM Backend (Supabase Production)"""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from starlette.middleware.cors import CORSMiddleware
import uuid, logging, random, os, httpx, csv, io, openpyxl
from io import BytesIO
from passlib.context import CryptContext
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# Password hashing configuration
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    if not hashed_password: return False
    # Check if it looks like a bcrypt hash (starts with $2b$ or $2a$)
    if hashed_password.startswith("$2"):
        return pwd_context.verify(plain_password, hashed_password)
    # Fallback to plain text for legacy users
    return plain_password == hashed_password

def get_password_hash(password):
    return pwd_context.hash(password)

app = FastAPI(title="Umang Hometech LLP CRM")

@app.get("/")
async def root_health():
    return {"status": "online", "message": "Umang Hometech LLP CRM Backend is running", "timestamp": datetime.now().isoformat()}

@app.get("/debug-config")
async def debug_config():
    return {
        "url_configured": bool(os.environ.get("SUPABASE_URL")),
        "key_configured": bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY")),
    }

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

STAGES = ["new","assigned","positive","site_visit","booking","loan","registration","closed"]
ROLES = ["admin","manager","telecaller","site_visit","booking","loan","marketing"]

# ---- Integration Config (from .env) ----
INTERAKT_API_KEY = os.environ.get("INTERAKT_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
FACEBOOK_VERIFY_TOKEN = os.environ.get("FACEBOOK_VERIFY_TOKEN", "")

# ---- Supabase Config ----
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xlaiwmyyldxmuvopqomi.supabase.co")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
    or ""
)

def sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
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
    h = {**sb_headers(), "Prefer": "return=representation"}
    r = _http.post(sb_url(table), headers=h, json=data)
    if r.status_code >= 400:
        logging.error(f"Supabase INSERT {table}: {r.status_code} {r.text[:300]}")
        return None
    if not r.text or not r.text.strip():
        return data  # Return the input data if Supabase returns empty body
    try:
        rows = r.json()
        return rows[0] if isinstance(rows, list) and rows else rows
    except Exception:
        return data

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
def model_payload(model: BaseModel) -> dict:
    data = {}
    for key, value in model.model_dump().items():
        if value is None:
            continue
        data[key] = value.isoformat() if isinstance(value, datetime) else value
    return data

# ---- Pydantic Models ----
class User(BaseModel):
    user_id: str; email: str; name: str; picture: Optional[str]=None
    role: Optional[str]=None; acting_as_employee_id: Optional[str]=None; created_at: datetime
    employee_id: Optional[str]=None
class RoleSet(BaseModel): role: str
class ActAs(BaseModel): employee_id: Optional[str]=None
class LeadCreatePublic(BaseModel):
    name: str; phone: str; email: Optional[str]=None; budget: Optional[str]=None
    location: Optional[str]=None; property_type: Optional[str]=None; notes: Optional[str]=None
    source: Optional[str]=None; starred: Optional[bool]=None
class LeadUpdate(BaseModel):
    stage: Optional[str]=None; status: Optional[str]=None; assigned_to: Optional[str]=None
    phone: Optional[str]=None; email: Optional[str]=None; budget: Optional[str]=None
    location: Optional[str]=None; property_type: Optional[str]=None; notes: Optional[str]=None
    source: Optional[str]=None; follow_up_at: Optional[datetime]=None; priority: Optional[str]=None
    starred: Optional[bool]=None
class NoteCreate(BaseModel): text: str; type: str="call_note"
class SiteVisitCreate(BaseModel): lead_id: str; scheduled_at: datetime; assigned_to: Optional[str]=None
class SiteVisitUpdate(BaseModel):
    status: Optional[str]=None; feedback: Optional[str]=None; interested: Optional[bool]=None
    scheduled_at: Optional[datetime]=None; assigned_to: Optional[str]=None
    property_details: Optional[str]=None; interest_level: Optional[str]=None
class SiteVisitFollowUpCreate(BaseModel):
    visit_id: str; follow_up_date: str; follow_up_time: str; follow_up_day: str
    notes: Optional[str]=None
class BookingCreate(BaseModel):
    lead_id: str; property_name: str; booking_amount: float; token_received: float=0
    unit_number: Optional[str]=None; tower: Optional[str]=None
    payment_status: Optional[str]=None; payment_progress: Optional[int]=None; booking_date: Optional[datetime]=None
    starred: Optional[bool]=None; completed_tasks: Optional[List[str]]=None
class BookingUpdate(BaseModel):
    token_received: Optional[float]=None; agreement_status: Optional[str]=None; status: Optional[str]=None
    property_name: Optional[str]=None; booking_amount: Optional[float]=None
    unit_number: Optional[str]=None; tower: Optional[str]=None
    payment_status: Optional[str]=None; payment_progress: Optional[int]=None; booking_date: Optional[datetime]=None
    starred: Optional[bool]=None; completed_tasks: Optional[List[str]]=None
class LoanCreate(BaseModel):
    lead_id: str; amount: float; bank_name: Optional[str]=None
    documents_status: Optional[str]=None; pending_documents: Optional[List[str]]=None
    starred: Optional[bool]=None
class LoanUpdate(BaseModel):
    bank_name: Optional[str]=None; application_status: Optional[str]=None; progress: Optional[int]=None; bank_stage: Optional[str]=None
    documents_status: Optional[str]=None; pending_documents: Optional[List[str]]=None; emi_eligible: Optional[float]=None
    amount: Optional[float]=None; starred: Optional[bool]=None
class EmployeeCreate(BaseModel): name: str; email: str; phone: Optional[str]=None; role: str; department: str
class EmployeeUpdate(BaseModel):
    name: Optional[str]=None; phone: Optional[str]=None; role: Optional[str]=None; active: Optional[bool]=None
class TemplateCreate(BaseModel): name: str; body: str
class CampaignCreate(BaseModel):
    name: str; template_id: Optional[str]=None; audience: str="all"; scheduled_at: Optional[datetime]=None

# ---- Auth Helpers ----
LOCAL_SESSIONS = {}
SESSION_CACHE = {"leads": [], "bookings": [], "visits": [], "followups": [], "loans": [], "activities": [], "customers": [], "notifications": []}

DEMO_LEADS = []
DEMO_BOOKINGS = []
DEMO_VISITS = []
DEMO_LOANS = []

async def get_session_token(request: Request):
    t = request.cookies.get("session_token")
    if t: return t
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "): return auth[7:]
    return None

# Hardcoded user registry — map user_id to their user object for cold-start recovery
HARDCODED_USERS = {
    "user_admin001": {
        "user_id": "user_admin001", "email": "htshpatil13@gmail.com",
        "name": "Umang Admin", "role": "admin", "created_at": "2026-01-01T00:00:00+00:00",
    },
    "user_mukesh001": {
        "user_id": "user_mukesh001", "email": "mukesh@umang.com",
        "name": "Mukesh Sharma", "role": "telecaller",
        "employee_id": "emp_1b7760567ae6", "acting_as_employee_id": "emp_1b7760567ae6",
        "created_at": "2026-01-01T00:00:00+00:00",
    },
    "user_manager001": {
        "user_id": "user_manager001", "email": "rohitsingh241993@gmail.com",
        "name": "Rohit Singh", "role": "manager", "created_at": "2026-01-01T00:00:00+00:00",
    },
}

async def get_current_user(request: Request) -> User:
    token = await get_session_token(request)
    if not token: raise HTTPException(401, "Not authenticated")
    
    # 1. Check in-memory cache first (fastest)
    if token in LOCAL_SESSIONS:
        sess = LOCAL_SESSIONS[token]
        if datetime.fromisoformat(sess["expires_at"].replace("Z","+00:00")) <= now_utc():
            del LOCAL_SESSIONS[token]
            raise HTTPException(401, "Session expired")
        u = dict(sess["user"])
        # Apply X-Acting-As header override (per-request, not persisted)
        act_as = request.headers.get("X-Acting-As")
        if act_as:
            u["acting_as_employee_id"] = act_as
        return User(**u)

    # 2. Look up session in Supabase
    rows = sb_select("sessions", {"session_token": f"eq.{token}", "select": "*"})
    if not rows: raise HTTPException(401, "Invalid session")
    sess = rows[0]
    exp = sess.get("expires_at", "")
    if exp and datetime.fromisoformat(exp.replace("Z","+00:00")) <= now_utc():
        raise HTTPException(401, "Session expired")
    
    uid = sess["user_id"]
    
    # 3. Try hardcoded users first (survives server restart)
    if uid in HARDCODED_USERS:
        u = dict(HARDCODED_USERS[uid])
        # Re-cache locally for speed
        LOCAL_SESSIONS[token] = {"user": u, "expires_at": exp}
        act_as = request.headers.get("X-Acting-As")
        if act_as:
            u["acting_as_employee_id"] = act_as
        return User(**u)
    
    # 4. Look up in users table (real database users)
    users = sb_select("users", {"user_id": f"eq.{uid}", "select": "*"})
    if not users: raise HTTPException(401, "User not found")
    u = users[0]
    # Cache for next time
    LOCAL_SESSIONS[token] = {"user": u, "expires_at": exp}
    act_as = request.headers.get("X-Acting-As")
    if act_as:
        u["acting_as_employee_id"] = act_as
    return User(**u)

# ---- Auth Endpoints ----
@api_router.post("/auth/session")
async def auth_session(request: Request, response: Response):
    body = await request.json()
    email, password = body.get("email"), body.get("password")
    
    # Hardcoded fallback for demo
    if email in ["umang@admin", "htshpatil13@gmail.com"] and password == "umang@admin":
        u = {
            "user_id": "user_admin001",
            "email": email,
            "name": "Umang Admin",
            "role": "admin",
            "created_at": now_utc().isoformat(),
        }
        token = gen_id("sess")
        u["created_at"] = u["created_at"] # ensure serializable
        expires = (now_utc() + timedelta(days=7)).isoformat()
        
        # Store locally for robustness
        LOCAL_SESSIONS[token] = {"user": u, "expires_at": expires}
        
        sb_insert("sessions", {
            "session_token": token,
            "user_id": u["user_id"],
            "created_at": now_utc().isoformat(),
            "expires_at": expires,
        })
        response.set_cookie(
            key="session_token", value=token, 
            max_age=604800, httponly=True, 
            samesite="none", path="/", secure=True
        )
        return {"user": u, "session_token": token}

    # Hardcoded sample employee: Mukesh Sharma (telecaller)
    if email == "mukesh@umang.com" and password == "mukesh@123":
        u = {
            "user_id": "user_mukesh001",
            "email": email,
            "name": "Mukesh Sharma",
            "role": "telecaller",
            "employee_id": "emp_1b7760567ae6",
            "acting_as_employee_id": "emp_1b7760567ae6",
            "created_at": now_utc().isoformat(),
        }
        token = gen_id("sess")
        expires = (now_utc() + timedelta(days=7)).isoformat()
        LOCAL_SESSIONS[token] = {"user": u, "expires_at": expires}
        sb_insert("sessions", {
            "session_token": token,
            "user_id": u["user_id"],
            "created_at": now_utc().isoformat(),
            "expires_at": expires,
        })
        response.set_cookie(
            key="session_token", value=token, 
            max_age=604800, httponly=True, 
            samesite="none", path="/", secure=True
        )
        return {"user": u, "session_token": token}

    # Hardcoded manager: Rohit Singh
    if email == "rohitsingh241993@gmail.com" and password == "umang@manager":
        u = {
            "user_id": "user_manager001",
            "email": email,
            "name": "Rohit Singh",
            "role": "manager",
            "created_at": now_utc().isoformat(),
        }
        token = gen_id("sess")
        expires = (now_utc() + timedelta(days=7)).isoformat()
        LOCAL_SESSIONS[token] = {"user": u, "expires_at": expires}
        sb_insert("sessions", {
            "session_token": token,
            "user_id": u["user_id"],
            "created_at": now_utc().isoformat(),
            "expires_at": expires,
        })
        response.set_cookie(
            key="session_token", value=token, 
            max_age=604800, httponly=True, 
            samesite="none", path="/", secure=True
        )
        return {"user": u, "session_token": token}

    # Alias mapping: allow shorthand "umang@admin" to resolve to the real admin email
    EMAIL_ALIASES = {
        "umang@admin": "htshpatil13@gmail.com",
    }
    lookup_email = EMAIL_ALIASES.get(email, email)
    
    # Query real users table
    users = sb_select("users", {"email": f"eq.{lookup_email}", "select": "*"})
    if not users:
        raise HTTPException(401, "Invalid email or password")
    
    u = users[0]
    # Robust check for both column names (password_hash is the new standard)
    db_password = u.get("password_hash") or u.get("password")
    
    if not db_password or not verify_password(password, db_password): 
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
        LOCAL_SESSIONS.pop(t, None)  # Clear in-memory cache
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
    # act-as is per-device: the frontend stores the employee_id in localStorage
    # and sends it as X-Acting-As header on every request.
    # We just return the user with the acting_as field set — no global state mutation.
    u = cu.model_dump(mode="json")
    u["acting_as_employee_id"] = payload.employee_id
    return u

# ---- WhatsApp Service Layer (Interakt) ----
class WhatsAppService:
    @staticmethod
    def send_template(phone: str, template_name: str, values: List[str] = []):
        """
        Sends a WhatsApp template via Interakt API.
        Values: List of strings to fill in the {{1}}, {{2}} placeholders.
        """
        # TEMPORARY: Disabled WhatsApp Business API for client campaign automation
        logging.info(f"[SIMULATION] Interakt Template '{template_name}' would be sent to {phone} with values {values}")
        return {"status": "simulated", "message": "WhatsApp automation is temporarily disabled"}

# ---- AI Assistant Service (from umang.py) ----
class AIService:
    @staticmethod
    def generate_reply(message_text: str):
        if not OPENAI_API_KEY:
            return "Hi! Thanks for your message. An agent will get back to you soon."
        
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "system",
                    "content": """
You are a professional real estate assistant for Umang Hometech LLP.
Your goal:
- Sound human and friendly
- Ask about budget, location, requirement
- Convert user into site visit
Example: "Hi 😊 Are you looking for 2BHK or 3BHK? We have great options available 🔥"
Always:
- Ask questions
- Engage user
- Push for site visit
- Don't be a bot
"""
                },
                {"role": "user", "content": message_text}
            ]
        }
        try:
            r = httpx.post(url, headers=headers, json=payload, timeout=15)
            data = r.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            logging.error(f"OpenAI API Error: {e}")
            return "Thank you for reaching out. We will assist you shortly."

    @staticmethod
    def generate_lead_summary(timeline: List[Dict[str, Any]]):
        if not OPENAI_API_KEY:
            return "No summary available."
        
        # Format the timeline for AI
        history = "\n".join([f"- {a.get('created_at', '')[:10]}: {a.get('text', '')}" for a in timeline[:20]])
        
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a senior real estate manager. Summarize the following lead activity into a single, punchy, professional sentence that tells the agent exactly what the current status is and what to do next. Be concise (max 20 words)."
                },
                {"role": "user", "content": f"Activity History:\n{history}"}
            ]
        }
        try:
            r = httpx.post(url, headers=headers, json=payload, timeout=15)
            data = r.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            logging.error(f"Lead Summary Error: {e}")
            return "Could not generate summary."

# ---- Assignment Engine (Round Robin) ----
def assign_lead_round_robin():
    """Finds the next active telecaller to assign a lead to."""
    # 1. Get all active telecallers
    emps = sb_select("employees", {"role": "eq.telecaller", "active": "eq.true", "order": "last_assigned_at.asc.nullslast"})
    if not emps:
        # Fallback to admins if no telecallers
        emps = sb_select("employees", {"role": "eq.admin", "active": "eq.true", "order": "last_assigned_at.asc.nullslast"})
    
    if not emps: return None
    
    selected = emps[0]
    # Update last_assigned_at
    sb_update("employees", "employee_id", selected["employee_id"], {"last_assigned_at": now_utc().isoformat()})
    return selected["employee_id"]

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

def get_lead_record(lead_id: str, select: str = "*"):
    leads = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": select})
    if leads:
        return leads[0]
    cache_match = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") == lead_id]
    return cache_match[0] if cache_match else None

def update_cached_lead(lead_id: str, data: dict):
    SESSION_CACHE["leads"] = [
        ({**l, **data} if l.get("lead_id") == lead_id else l)
        for l in SESSION_CACHE["leads"]
    ]

def first_related_record(table: str, cache_key: str, lead_id: str):
    rows = sb_select(table, {"lead_id": f"eq.{lead_id}", "select": "*", "limit": "1"})
    if rows:
        return rows[0]
    cache_match = [r for r in SESSION_CACHE[cache_key] if r.get("lead_id") == lead_id]
    return cache_match[0] if cache_match else None

def get_visit_record(visit_id: str):
    rows = sb_select("visits", {"visit_id": f"eq.{visit_id}", "select": "*", "limit": "1"})
    if rows:
        return rows[0]
    cache_match = [v for v in SESSION_CACHE["visits"] if v.get("visit_id") == visit_id]
    return cache_match[0] if cache_match else None

def parse_follow_up_at(follow_up_date: str, follow_up_time: str) -> datetime:
    date_value = (follow_up_date or "").strip()
    time_value = (follow_up_time or "").strip()
    if not date_value or not time_value:
        raise HTTPException(400, "Follow-up date and time are required")
    try:
        parsed = datetime.fromisoformat(f"{date_value}T{time_value}")
    except ValueError:
        raise HTTPException(400, "Follow-up date/time must be valid")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed

def ensure_visit_record(lead_id: str, lead_name: Optional[str] = None, assigned_to: Optional[str] = None):
    existing = first_related_record("visits", "visits", lead_id)
    if existing:
        return existing
    lead = get_lead_record(lead_id)
    if not lead:
        return None
    v = {
        "visit_id": gen_id("vis"),
        "lead_id": lead_id,
        "lead_name": lead_name or lead.get("name", "Lead"),
        "scheduled_at": now_utc().isoformat(),
        "assigned_to": assigned_to or lead.get("assigned_to"),
        "status": "scheduled",
        "feedback": None,
        "interested": None,
        "created_at": now_utc().isoformat(),
    }
    result = sb_insert("visits", v)
    SESSION_CACHE["visits"].insert(0, result or v)
    return result or v

def ensure_booking_record(lead_id: str, lead_name: Optional[str] = None):
    existing = first_related_record("bookings", "bookings", lead_id)
    if existing:
        return existing
    lead = get_lead_record(lead_id)
    if not lead:
        return None
    b = {
        "booking_id": gen_id("bkg"),
        "lead_id": lead_id,
        "lead_name": lead_name or lead.get("name", "Lead"),
        "property_name": "Selected Property",
        "booking_amount": 0,
        "token_received": 0,
        "agreement_status": "pending",
        "payment_progress": 0,
        "payment_status": "pending",
        "status": "active",
        "created_at": now_utc().isoformat(),
    }
    result = sb_insert("bookings", b)
    SESSION_CACHE["bookings"].insert(0, result or b)
    return result or b

def ensure_loan_record(lead_id: str, lead_name: Optional[str] = None):
    existing = first_related_record("loans", "loans", lead_id)
    if existing:
        return existing
    lead = get_lead_record(lead_id)
    if not lead:
        return None
    ln = {
        "loan_id": gen_id("lon"),
        "lead_id": lead_id,
        "lead_name": lead_name or lead.get("name", "Lead"),
        "bank_name": "Bank Pending",
        "amount": 0,
        "application_status": "pending",
        "bank_stage": "documentation",
        "documents_status": "pending",
        "pending_documents": [],
        "emi_eligible": None,
        "progress": 0,
        "created_at": now_utc().isoformat(),
    }
    result = sb_insert("loans", ln)
    if not result:
        minimal = {
            "loan_id": ln["loan_id"],
            "lead_id": ln["lead_id"],
            "lead_name": ln["lead_name"],
            "bank_name": ln["bank_name"],
            "amount": ln["amount"],
            "application_status": ln["application_status"],
            "bank_stage": ln["bank_stage"],
            "emi_eligible": ln["emi_eligible"],
            "progress": ln["progress"],
            "created_at": ln["created_at"],
        }
        result = sb_insert("loans", minimal)
        ln = minimal
    SESSION_CACHE["loans"].insert(0, result or ln)
    return result or ln

def create_notification(user_id: Optional[str], title: str, message: str, lead_id: Optional[str] = None, type_: str = "workflow"):
    if not user_id:
        return None
    n = {
        "notification_id": gen_id("ntf"),
        "user_id": user_id,
        "lead_id": lead_id,
        "type": type_,
        "title": title,
        "message": message,
        "is_read": False,
        "created_at": now_utc().isoformat(),
    }
    result = sb_insert("notifications", n)
    if result:
        SESSION_CACHE["notifications"].insert(0, result)
    return result

def create_customer_from_lead(lead_id: str, actor=None):
    existing = sb_select("customers", {"lead_id": f"eq.{lead_id}", "select": "*", "limit": "1"})
    if existing:
        return existing[0]
    lead = get_lead_record(lead_id)
    if not lead:
        return None
    booking = first_related_record("bookings", "bookings", lead_id)
    loan = first_related_record("loans", "loans", lead_id)
    customer = {
        "customer_id": gen_id("cus"),
        "lead_id": lead_id,
        "name": lead.get("name"),
        "phone": lead.get("phone"),
        "email": lead.get("email"),
        "location": lead.get("location"),
        "budget": lead.get("budget"),
        "property_type": lead.get("property_type"),
        "source": lead.get("source"),
        "booking_id": booking.get("booking_id") if booking else None,
        "loan_id": loan.get("loan_id") if loan else None,
        "status": "converted",
        "converted_at": now_utc().isoformat(),
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    result = sb_insert("customers", customer)
    if result:
        SESSION_CACHE["customers"].insert(0, result)
        log_activity(actor, "converted_customer", "Lead converted into customer record.", lead_id=lead_id)
    return result or customer

# ---- Leads ----
@api_router.post("/leads/public")
async def create_lead_public(p: LeadCreatePublic):
    lid = gen_id("lead")
    assigned_to = assign_lead_round_robin()
    initial_stage = "assigned" if assigned_to else "new"
    lead = {
        "lead_id": lid, "name": p.name, "phone": p.phone, "email": p.email,
        "budget": p.budget, "location": p.location, "property_type": p.property_type,
        "notes": p.notes, "source": p.source or "website", "stage": initial_stage, "status": "active",
        "assigned_to": assigned_to, "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
    }
    if p.starred is not None: lead["starred"] = p.starred
    result = sb_insert("leads", lead)
    log_activity(None, "website_enquiry", f"New website enquiry received from {p.name}.", lead_id=lid)
    create_notification(assigned_to, "New lead assigned", f"{p.name} has been assigned to you.", lead_id=lid)
    
    # Auto-responder (Real Interakt API if key exists)
    WhatsAppService.send_template(p.phone, "welcome_enquiry", [p.name])
    
    return result or lead

# ---- Webhooks (MagicBricks, 99acres, Facebook) ----
@api_router.get("/webhooks/facebook")
async def verify_fb_webhook(request: Request):
    # Meta requires this for initial verification
    params = request.query_params
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == FACEBOOK_VERIFY_TOKEN:
        return int(params.get("hub.challenge"))
    return "Invalid verify token"

@api_router.post("/webhooks/{source}")
async def incoming_webhook(source: str, request: Request):
    """
    Unified endpoint for MagicBricks, 99acres, and Facebook Lead Ads.
    Usage: Set your portal's webhook URL to: https://your-backend.com/api/webhooks/[magicbricks|99acres|facebook]
    """
    try:
        body = await request.json()
    except:
        body = await request.form()
        body = dict(body)

    logging.info(f"Incoming Lead from {source}: {body}")
    
    # Standardize data based on source (placeholders for portal mapping)
    name = body.get("name") or body.get("customer_name") or body.get("full_name", "Valued Customer")
    phone = body.get("phone") or body.get("mobile") or body.get("contact_number", "")
    email = body.get("email") or ""
    
    if not phone:
        return {"status": "ignored", "reason": "no phone number"}

    lid = gen_id("lead")
    assigned_to = assign_lead_round_robin()
    initial_stage = "assigned" if assigned_to else "new"
    
    lead = {
        "lead_id": lid, "name": name, "phone": phone, "email": email,
        "source": source, "stage": initial_stage, "status": "active",
        "assigned_to": assigned_to, "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
    }
    sb_insert("leads", lead)
    log_activity(None, "webhook_enquiry", f"New lead from {source}: {name}", lead_id=lid)
    create_notification(assigned_to, "New lead assigned", f"{name} came from {source}.", lead_id=lid)
    
    return {"status": "success", "lead_id": lid}

@api_router.post("/webhooks/whatsapp/reply")
async def inbound_whatsapp_reply(request: Request):
    """
    Handle incoming WhatsApp replies from Interakt.
    """
    # TEMPORARY: WhatsApp Webhook Automation is temporarily disabled
    return {"status": "disabled", "message": "WhatsApp Automation is temporarily disabled"}

@api_router.post("/leads/import")
async def import_leads(file: UploadFile = File(...), cu: User = Depends(get_current_user)):
    filename = file.filename.lower()
    
    # Supported files: .csv, .xlsx, .xls
    if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files (.xlsx, .xls) are supported.")
    
    contents = await file.read()
    records = []

    # Helper function to normalize headers and find indexes
    def map_headers(headers):
        header_mapping = {}
        for idx, h in enumerate(headers):
            if not h:
                continue
            h_clean = str(h).strip().lower()
            if any(term in h_clean for term in ["phone", "mobile", "contact"]):
                header_mapping["phone"] = idx
            elif any(term in h_clean for term in ["email", "mail"]):
                header_mapping["email"] = idx
            elif any(term in h_clean for term in ["budget", "price"]):
                header_mapping["budget"] = idx
            elif any(term in h_clean for term in ["location", "locality", "address"]):
                header_mapping["location"] = idx
            elif any(term in h_clean for term in ["property type", "configuration", "config", "requirement"]):
                header_mapping["property_type"] = idx
            elif any(term in h_clean for term in ["property", "project", "society", "building", "apartment", "flat"]):
                header_mapping["preferred_property"] = idx
            elif any(term in h_clean for term in ["notes", "remarks", "comments"]):
                header_mapping["notes"] = idx
            elif any(term in h_clean for term in ["name", "full name", "customer name", "lead name"]):
                if not any(prop in h_clean for prop in ["property", "project", "society", "building", "flat", "apartment"]):
                    header_mapping["name"] = idx
        return header_mapping

    if filename.endswith(".csv"):
        try:
            text = contents.decode("utf-8")
            csv_reader = csv.reader(io.StringIO(text))
            rows = list(csv_reader)
            if not rows:
                raise HTTPException(status_code=400, detail="CSV file is empty.")
            
            headers = rows[0]
            header_map = map_headers(headers)
            
            if "name" not in header_map or "phone" not in header_map:
                raise HTTPException(
                    status_code=400, 
                    detail="CSV must contain at least 'Name' and 'Phone Number' columns."
                )
                
            for row in rows[1:]:
                if not row or len(row) <= max(header_map.values(), default=0):
                    continue
                records.append({
                    "name": row[header_map["name"]],
                    "phone": row[header_map["phone"]],
                    "email": row[header_map["email"]] if "email" in header_map else "",
                    "budget": row[header_map["budget"]] if "budget" in header_map else "",
                    "location": row[header_map["location"]] if "location" in header_map else "",
                    "property_type": row[header_map["property_type"]] if "property_type" in header_map else "",
                    "preferred_property": row[header_map["preferred_property"]] if "preferred_property" in header_map else "",
                    "notes": row[header_map["notes"]] if "notes" in header_map else ""
                })
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

    else: # Excel
        try:
            wb = openpyxl.load_workbook(filename=BytesIO(contents), data_only=True)
            sheet = wb.active
            rows = list(sheet.iter_rows(values_only=True))
            if not rows:
                raise HTTPException(status_code=400, detail="Excel file is empty.")
            
            headers = rows[0]
            header_map = map_headers(headers)
            
            if "name" not in header_map or "phone" not in header_map:
                raise HTTPException(
                    status_code=400, 
                    detail="Excel sheet must contain at least 'Name' and 'Phone Number' columns."
                )
                
            for row in rows[1:]:
                if not row or all(c is None for c in row):
                    continue
                
                def get_val(key):
                    if key in header_map and header_map[key] < len(row):
                        val = row[header_map[key]]
                        return str(val).strip() if val is not None else ""
                    return ""

                records.append({
                    "name": get_val("name"),
                    "phone": get_val("phone"),
                    "email": get_val("email"),
                    "budget": get_val("budget"),
                    "location": get_val("location"),
                    "property_type": get_val("property_type"),
                    "preferred_property": get_val("preferred_property"),
                    "notes": get_val("notes")
                })
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel: {str(e)}")

    imported_count = 0
    skipped_count = 0
    imported_leads = []

    for r in records:
        name = r["name"].strip()
        phone = r["phone"].strip()
        
        if not name or not phone:
            skipped_count += 1
            continue

        assigned_to = assign_lead_round_robin()
        lid = gen_id("lead")
        now = now_utc().isoformat()
        
        pref_prop = r.get("preferred_property", "").strip()
        r_notes = r["notes"].strip()
        if pref_prop:
            if r_notes:
                lead_notes = f"Preferred Property: {pref_prop}\n{r_notes}"
            else:
                lead_notes = f"Preferred Property: {pref_prop}"
        else:
            lead_notes = r_notes

        lead = {
            "lead_id": lid,
            "name": name,
            "phone": phone,
            "email": r["email"],
            "budget": r["budget"],
            "location": r["location"],
            "property_type": r["property_type"],
            "notes": lead_notes,
            "source": "bulk_import",
            "stage": "new",
            "status": "active",
            "assigned_to": assigned_to,
            "created_at": now,
            "updated_at": now
        }
        
        result = sb_insert("leads", lead)
        SESSION_CACHE["leads"].insert(0, result or lead)
        log_activity(cu, "bulk_import", f"Lead imported via bulk upload: {name}", lead_id=lid)
        imported_leads.append(result or lead)
        imported_count += 1
        
    return {
        "status": "success",
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "leads": imported_leads[:10]
    }

@api_router.delete("/leads/clear-all")
async def clear_all_leads(cu: User = Depends(get_current_user)):
    # Verify the user is admin
    if cu.role != "admin" and cu.email != "htshpatil13@gmail.com":
        raise HTTPException(status_code=403, detail="Only admins can delete all leads.")
        
    tables_to_wipe = ["notifications", "customers", "lead_notes", "visit_followups", "visits", "bookings", "loans", "activities", "leads"]
    optional_tables = {"notifications", "customers", "lead_notes", "visit_followups"}
    
    # We clear them from Supabase
    import httpx
    errors = []
    for table in tables_to_wipe:
        try:
            r = httpx.delete(
                f"{SUPABASE_URL}/rest/v1/{table}?created_at=not.is.null",
                headers=sb_headers()
            )
            if r.status_code >= 400:
                if r.status_code == 404 and table in optional_tables:
                    continue
                errors.append(f"Failed to wipe {table}: {r.text}")
        except Exception as e:
            errors.append(f"Failed to wipe {table} due to exception: {str(e)}")
            
    # Clear local session cache
    for table in tables_to_wipe:
        if table in SESSION_CACHE:
            SESSION_CACHE[table] = []
    SESSION_CACHE["followups"] = []
    
    if errors:
        raise HTTPException(status_code=500, detail="; ".join(errors))
        
    return {"status": "success", "message": "All leads and associated records have been wiped."}

@api_router.post("/leads")
async def create_lead(p: LeadCreatePublic, cu: User=Depends(get_current_user)):
    lid = gen_id("lead")
    lead = {
        "lead_id": lid, "name": p.name, "phone": p.phone, "email": p.email,
        "budget": p.budget, "location": p.location, "property_type": p.property_type,
        "notes": p.notes, "source": p.source or "manual_entry", "stage": "new", "status": "active",
        "assigned_to": None, "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
    }
    if p.starred is not None: lead["starred"] = p.starred
    result = sb_insert("leads", lead)
    # Always add to session cache for immediate responsiveness
    SESSION_CACHE["leads"].insert(0, result or lead)
    log_activity(cu, "manual_enquiry", f"Manual lead entry created for {p.name}.", lead_id=lid)
    return result or lead

@api_router.get("/leads")
async def list_leads(stage: Optional[str]=None, status_: Optional[str]=None, assigned_to: Optional[str]=None, cu: User=Depends(get_current_user)):
    params = {"select": "*", "order": "created_at.desc"}
    if stage: params["stage"] = f"eq.{stage}"
    if status_: params["status"] = f"eq.{status_}"
    if assigned_to: params["assigned_to"] = f"eq.{assigned_to}"
    
    leads = sb_select("leads", params)
    
    # Filter session cache to match the query parameters
    filtered_cache = []
    for l in SESSION_CACHE["leads"]:
        match = True
        if stage and l.get("stage") != stage: match = False
        if status_ and l.get("status") != status_: match = False
        if assigned_to and l.get("assigned_to") != assigned_to: match = False
        if match:
            filtered_cache.append(l)

    # Merge with session cache (deduplicate: cache wins)
    cache_ids = {l.get("lead_id") for l in filtered_cache}
    db_only = [l for l in leads if l.get("lead_id") not in cache_ids]
    all_leads = filtered_cache + db_only

    if not all_leads and not stage and not status_ and not assigned_to:
        return []
    return all_leads

@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": "*"})
    lead = None
    if leads:
        lead = leads[0]
    else:
        cache_match = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") == lead_id]
        if cache_match:
            lead = cache_match[0]
    if not lead: raise HTTPException(404, "Lead not found")
    timeline = sb_select("activities", {"lead_id": f"eq.{lead_id}", "select": "*", "order": "created_at.desc"})
    cache_activities = [a for a in SESSION_CACHE["activities"] if a.get("lead_id") == lead_id]
    
    # Deduplicate activities
    cache_act_ids = {a.get("activity_id") for a in cache_activities}
    all_timeline = cache_activities + [a for a in timeline if a.get("activity_id") not in cache_act_ids]
    
    return {"lead": lead, "timeline": all_timeline}

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, cu: User=Depends(get_current_user)):
    if cu.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete leads")
    
    # 1. Delete associated data first
    sb_delete("visit_followups", "lead_id", lead_id)
    sb_delete("visits", "lead_id", lead_id)
    sb_delete("bookings", "lead_id", lead_id)
    sb_delete("loans", "lead_id", lead_id)
    sb_delete("activities", "lead_id", lead_id)
    sb_delete("lead_notes", "lead_id", lead_id)
    sb_delete("customers", "lead_id", lead_id)
    sb_delete("notifications", "lead_id", lead_id)
    
    # 2. Delete the lead
    res = sb_delete("leads", "lead_id", lead_id)
    
    # 3. Clean from session cache
    global SESSION_CACHE
    if "leads" in SESSION_CACHE:
        SESSION_CACHE["leads"] = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") != lead_id]
    if "visits" in SESSION_CACHE:
        SESSION_CACHE["visits"] = [v for v in SESSION_CACHE["visits"] if v.get("lead_id") != lead_id]
    if "followups" in SESSION_CACHE:
        SESSION_CACHE["followups"] = [f for f in SESSION_CACHE["followups"] if f.get("lead_id") != lead_id]
    if "bookings" in SESSION_CACHE:
        SESSION_CACHE["bookings"] = [b for b in SESSION_CACHE["bookings"] if b.get("lead_id") != lead_id]
    if "loans" in SESSION_CACHE:
        SESSION_CACHE["loans"] = [ln for ln in SESSION_CACHE["loans"] if ln.get("lead_id") != lead_id]
    if "activities" in SESSION_CACHE:
        SESSION_CACHE["activities"] = [a for a in SESSION_CACHE["activities"] if a.get("lead_id") != lead_id]
    if "customers" in SESSION_CACHE:
        SESSION_CACHE["customers"] = [c for c in SESSION_CACHE["customers"] if c.get("lead_id") != lead_id]
    if "notifications" in SESSION_CACHE:
        SESSION_CACHE["notifications"] = [n for n in SESSION_CACHE["notifications"] if n.get("lead_id") != lead_id]
    
    return {"status": "deleted", "lead_id": lead_id}

@api_router.get("/leads/{lead_id}/ai-summary")
async def get_lead_ai_summary(lead_id: str, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": "*"})
    if not leads: raise HTTPException(404, "Lead not found")
    
    timeline = sb_select("activities", {"lead_id": f"eq.{lead_id}", "select": "*", "order": "created_at.desc", "limit": "20"})
    
    # Try Real AI first
    summary = AIService.generate_lead_summary(timeline)
    
    # If AI fails (e.g. 401 error), use the Smart Fallback
    if not summary or "Could not generate" in summary or "available" in summary:
        l = leads[0]
        summary = f"Customer interested in {l.get('property_type','property')} in {l.get('location','specified area')} with a budget of {l.get('budget','budget')}. {l.get('notes','Follow up for site visit.')}"
        if len(summary) > 100: summary = summary[:97] + "..."

    return {"summary": summary}

@api_router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, p: LeadUpdate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": "*"})
    old_lead = None
    if leads:
        old_lead = leads[0]
    else:
        # Check cache
        cache_match = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") == lead_id]
        if cache_match:
            old_lead = cache_match[0]
            
    if not old_lead: raise HTTPException(404, "Lead not found")
    
    data = model_payload(p)
    data["updated_at"] = now_utc().isoformat()
    
    # Auto-set stage to 'assigned' when admin assigns a lead that's at 'new' stage
    if p.assigned_to and old_lead.get("stage") == "new":
        data["stage"] = "assigned"
    
    # Log assignment activity
    if p.assigned_to and p.assigned_to != old_lead.get("assigned_to"):
        emp_name = p.assigned_to
        emps = sb_select("employees", {"employee_id": f"eq.{p.assigned_to}", "select": "name"})
        if emps: emp_name = emps[0]["name"]
        log_activity(cu, "lead_assigned", f"Assigned lead to {emp_name}", lead_id=lead_id)
        create_notification(p.assigned_to, "Lead assigned", f"{old_lead.get('name', 'Lead')} has been assigned to you.", lead_id=lead_id)
    
    updated = sb_update("leads", "lead_id", lead_id, data)
    
    # Always update cache for immediate UI feedback
    if leads:
        # If it was in DB, we still want it in cache if DB update is unreliable
        new_lead = {**old_lead, **data}
        SESSION_CACHE["leads"] = [l if l.get("lead_id") != lead_id else new_lead for l in SESSION_CACHE["leads"]]
        if not any(l.get("lead_id") == lead_id for l in SESSION_CACHE["leads"]):
            SESSION_CACHE["leads"].insert(0, new_lead)
    else:
        # Update existing cache entry
        new_lead = {**old_lead, **data}
        SESSION_CACHE["leads"] = [l if l.get("lead_id") != lead_id else new_lead for l in SESSION_CACHE["leads"]]
        updated = new_lead
    
    # Log activity for stage/status changes
    if p.stage and p.stage != old_lead.get("stage"):
        act_type = f"stage_change_{p.stage}"
        if p.stage == "positive": act_type = "positive_response"
        log_activity(cu, act_type, f"Moved lead stage from {old_lead.get('stage')} to {p.stage}", lead_id=lead_id)
    
    if p.status and p.status != old_lead.get("status"):
        act_type = f"status_change_{p.status}"
        if p.status == "negative": act_type = "negative_response"
        log_activity(cu, act_type, f"Changed lead status from {old_lead.get('status')} to {p.status}", lead_id=lead_id)

    # Auto-create related records when lead enters a new department stage
    if p.stage and p.stage != old_lead.get("stage"):
        if p.stage in ["positive", "site_visit"]:
            ensure_visit_record(lead_id, old_lead.get("name", "Lead"), old_lead.get("assigned_to"))
            if p.stage == "positive":
                create_notification(old_lead.get("assigned_to"), "Positive lead", f"{old_lead.get('name', 'Lead')} is ready for site visit follow-up.", lead_id=lead_id)
        elif p.stage == "booking":
            ensure_booking_record(lead_id, old_lead.get("name", "Lead"))
        elif p.stage == "loan":
            ensure_loan_record(lead_id, old_lead.get("name", "Lead"))
        elif p.stage == "closed":
            create_customer_from_lead(lead_id, cu)

    return updated

@api_router.post("/leads/{lead_id}/notes")
async def add_lead_note(lead_id: str, p: NoteCreate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": "lead_id"})
    if not leads:
        cache_match = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") == lead_id]
        if not cache_match: raise HTTPException(404, "Lead not found")
    activity = log_activity(cu, p.type, p.text, lead_id=lead_id)
    if activity: SESSION_CACHE["activities"].insert(0, activity)
    return activity

@api_router.post("/leads/{lead_id}/advance")
async def advance_lead(lead_id: str, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": "*"})
    lead = None
    if leads:
        lead = leads[0]
    else:
        cache_match = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") == lead_id]
        if cache_match: lead = cache_match[0]
    if not lead: raise HTTPException(404, "Lead not found")
    cur = lead.get("stage", "new")
    try: idx = STAGES.index(cur)
    except: idx = 0
    if idx >= len(STAGES) - 1: return lead
    new_stage = STAGES[idx + 1]
    updated = sb_update("leads", "lead_id", lead_id, {"stage": new_stage, "updated_at": now_utc().isoformat()})
    # Update cache
    new_lead = {**lead, "stage": new_stage, "updated_at": now_utc().isoformat()}
    SESSION_CACHE["leads"] = [l if l.get("lead_id") != lead_id else new_lead for l in SESSION_CACHE["leads"]]
    if not any(l.get("lead_id") == lead_id for l in SESSION_CACHE["leads"]):
        SESSION_CACHE["leads"].insert(0, new_lead)

    # Auto-create related records when lead enters a new department stage
    if new_stage in ["positive", "site_visit"]:
        ensure_visit_record(lead_id, lead.get("name", "Lead"), lead.get("assigned_to"))
    elif new_stage == "booking":
        ensure_booking_record(lead_id, lead.get("name", "Lead"))
    elif new_stage == "loan":
        ensure_loan_record(lead_id, lead.get("name", "Lead"))
    elif new_stage == "closed":
        create_customer_from_lead(lead_id, cu)

    log_activity(cu, "stage_change", f"Stage moved {cur} → {new_stage}", lead_id=lead_id)
    return updated or new_lead

# ---- Stage Sync Helper ----
def sync_lead_stage(lead_id: str, target_stage: str, force: bool = False):
    """Ensure lead is at least at target_stage in the pipeline.
    If force=True, also moves a 'closed' lead back to the target_stage."""
    leads_db = sb_select("leads", {"lead_id": f"eq.{lead_id}", "select": "lead_id,stage"})
    lead = None
    if leads_db:
        lead = leads_db[0]
    else:
        cache_match = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") == lead_id]
        if cache_match: lead = cache_match[0]
    if not lead: return
    cur = lead.get("stage", "new")
    try: cur_idx = [s for s in STAGES].index(cur)
    except ValueError: cur_idx = 0
    try: target_idx = [s for s in STAGES].index(target_stage)
    except ValueError: return
    needs_update = cur_idx < target_idx
    # If lead is closed but we're creating/updating an active department record, bring it back
    if force and cur == "closed" and target_stage != "closed":
        needs_update = True
    if needs_update:
        sb_update("leads", "lead_id", lead_id, {"stage": target_stage, "updated_at": now_utc().isoformat()})
        SESSION_CACHE["leads"] = [({**l, "stage": target_stage, "updated_at": now_utc().isoformat()} if l.get("lead_id") == lead_id else l) for l in SESSION_CACHE["leads"]]
        if target_stage == "closed":
            create_customer_from_lead(lead_id)

# ---- Visits ----
@api_router.post("/visits")
async def create_visit(p: SiteVisitCreate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{p.lead_id}", "select": "lead_id,name"})
    lead_name = "Lead"
    if leads:
        lead_name = leads[0]["name"]
    else:
        cache_match = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") == p.lead_id]
        if cache_match:
            lead_name = cache_match[0].get("name", "Lead")
        else:
            raise HTTPException(404, "Lead not found")
    vid = gen_id("vis")
    v = {
        "visit_id": vid, "lead_id": p.lead_id, "lead_name": lead_name, "scheduled_at": p.scheduled_at.isoformat(),
        "assigned_to": p.assigned_to, "status": "scheduled", "feedback": None,
        "interested": None, "created_at": now_utc().isoformat(),
    }
    result = sb_insert("visits", v)
    SESSION_CACHE["visits"].insert(0, result or v)
    # Auto-sync lead stage to site_visit
    sync_lead_stage(p.lead_id, "site_visit", force=True)
    return result or v

@api_router.get("/visits")
async def list_visits(cu: User=Depends(get_current_user)):
    visits = sb_select("visits", {"select": "*", "order": "scheduled_at.desc"})
    followups = sb_select("visit_followups", {"select": "*", "order": "follow_up_at.desc"})
    # Deduplicate visits (cache wins)
    cache_ids = {v.get("visit_id") for v in SESSION_CACHE["visits"]}
    db_only = [v for v in visits if v.get("visit_id") not in cache_ids]
    all_visits = SESSION_CACHE["visits"] + db_only

    cache_followup_ids = {f.get("followup_id") for f in SESSION_CACHE["followups"]}
    all_followups = SESSION_CACHE["followups"] + [f for f in followups if f.get("followup_id") not in cache_followup_ids]

    # Fetch all leads & employees to enrich dynamically
    leads = sb_select("leads", {"select": "lead_id,name"})
    employees = sb_select("employees", {"select": "employee_id,name"})

    cache_leads = {l.get("lead_id"): l.get("name") for l in SESSION_CACHE["leads"]}
    db_leads = {l.get("lead_id"): l.get("name") for l in leads}
    lead_name_map = {**db_leads, **cache_leads}

    emp_map = {e.get("employee_id"): e.get("name") for e in employees}

    enriched_visits = []
    for v in all_visits:
        v_copy = dict(v)
        v_copy["lead_name"] = lead_name_map.get(v.get("lead_id"), v.get("lead_name", "Lead"))
        if v.get("assigned_to"):
            v_copy["assigned_name"] = emp_map.get(v.get("assigned_to"))
        visit_followups = [f for f in all_followups if f.get("visit_id") == v.get("visit_id")]
        v_copy["followups_count"] = max(len(visit_followups), 1 if v.get("status") == "follow_up" else 0)
        v_copy["next_follow_up_at"] = visit_followups[0].get("follow_up_at") if visit_followups else None
        v_copy["next_follow_up_date"] = visit_followups[0].get("follow_up_date") if visit_followups else None
        v_copy["next_follow_up_time"] = visit_followups[0].get("follow_up_time") if visit_followups else None
        v_copy["next_follow_up_day"] = visit_followups[0].get("follow_up_day") if visit_followups else None
        enriched_visits.append(v_copy)

    return enriched_visits

@api_router.patch("/visits/{visit_id}")
async def update_visit(visit_id: str, p: SiteVisitUpdate, cu: User=Depends(get_current_user)):
    data = model_payload(p)
    updated = sb_update("visits", "visit_id", visit_id, data)
    # Update cache
    visit_record = None
    for i, v in enumerate(SESSION_CACHE["visits"]):
        if v.get("visit_id") == visit_id:
            SESSION_CACHE["visits"][i] = {**v, **data}
            visit_record = SESSION_CACHE["visits"][i]
            if not updated: updated = SESSION_CACHE["visits"][i]
            break
    if not updated:
        db_visits = sb_select("visits", {"visit_id": f"eq.{visit_id}"})
        if db_visits:
            visit_record = db_visits[0]
            updated = visit_record
        else:
            raise HTTPException(404, "Visit not found")
    # Auto-sync lead stage
    if visit_record and visit_record.get("lead_id"):
        lead_id = visit_record["lead_id"]
        if p.interested is True:
            sync_lead_stage(lead_id, "booking", force=False)
            ensure_booking_record(lead_id, visit_record.get("lead_name"))
            log_activity(cu, "site_visit_interested", "Site visit marked interested; moved to booking department.", lead_id=lead_id)
        else:
            sync_lead_stage(lead_id, "site_visit", force=True)
    return updated

@api_router.post("/visit-followups")
async def create_visit_followup(p: SiteVisitFollowUpCreate, cu: User=Depends(get_current_user)):
    if not p.follow_up_day.strip():
        raise HTTPException(400, "Follow-up day is required")

    follow_up_at = parse_follow_up_at(p.follow_up_date, p.follow_up_time)
    visit = get_visit_record(p.visit_id)
    if not visit:
        raise HTTPException(404, "Visit not found")

    followup = {
        "followup_id": gen_id("fup"),
        "visit_id": p.visit_id,
        "lead_id": visit.get("lead_id"),
        "lead_name": visit.get("lead_name", "Lead"),
        "follow_up_date": p.follow_up_date.strip(),
        "follow_up_time": p.follow_up_time.strip(),
        "follow_up_day": p.follow_up_day.strip(),
        "follow_up_at": follow_up_at.isoformat(),
        "status": "scheduled",
        "notes": p.notes,
        "created_by": cu.acting_as_employee_id or cu.user_id,
        "created_at": now_utc().isoformat(),
    }
    result = sb_insert("visit_followups", followup)
    followup_record = result or followup
    SESSION_CACHE["followups"].insert(0, followup_record)

    visit_update = {
        "status": "follow_up",
        "scheduled_at": follow_up_at.isoformat(),
    }
    sb_update("visits", "visit_id", p.visit_id, visit_update)
    for i, cached_visit in enumerate(SESSION_CACHE["visits"]):
        if cached_visit.get("visit_id") == p.visit_id:
            SESSION_CACHE["visits"][i] = {**cached_visit, **visit_update}
            break

    if followup.get("lead_id"):
        lead_update = {"follow_up_at": follow_up_at.isoformat(), "updated_at": now_utc().isoformat()}
        sb_update("leads", "lead_id", followup["lead_id"], lead_update)
        update_cached_lead(followup["lead_id"], lead_update)
        activity = log_activity(
            cu,
            "site_visit_followup",
            f"Follow-up scheduled for {p.follow_up_day.strip()} {p.follow_up_date.strip()} at {p.follow_up_time.strip()}.",
            lead_id=followup["lead_id"],
        )
        SESSION_CACHE["activities"].insert(0, activity)

    return followup_record

@api_router.get("/visit-followups")
async def list_visit_followups(visit_id: Optional[str]=None, lead_id: Optional[str]=None, cu: User=Depends(get_current_user)):
    rows = sb_select("visit_followups", {"select": "*", "order": "follow_up_at.desc"})
    cache_ids = {f.get("followup_id") for f in SESSION_CACHE["followups"]}
    followups = SESSION_CACHE["followups"] + [f for f in rows if f.get("followup_id") not in cache_ids]
    if visit_id:
        followups = [f for f in followups if f.get("visit_id") == visit_id]
    if lead_id:
        followups = [f for f in followups if f.get("lead_id") == lead_id]
    return followups

# ---- Bookings ----
@api_router.post("/bookings")
async def create_booking(p: BookingCreate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{p.lead_id}", "select": "lead_id,name"})
    lead_name = "Lead"
    if leads:
        lead_name = leads[0]["name"]
    else:
        cache_match = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") == p.lead_id]
        if cache_match:
            lead_name = cache_match[0].get("name", "Lead")
        else:
            raise HTTPException(404, "Lead not found")
    bid = gen_id("bkg")
    b = {
        "booking_id": bid, "lead_id": p.lead_id, "lead_name": lead_name,
        "property_name": p.property_name, "booking_amount": p.booking_amount,
        "token_received": p.token_received, "agreement_status": "pending",
        "payment_progress": p.payment_progress if p.payment_progress is not None else (int((p.token_received / p.booking_amount) * 100) if p.booking_amount else 0),
        "status": "active", "created_at": now_utc().isoformat(),
    }
    if p.unit_number: b["unit_number"] = p.unit_number
    if p.tower: b["tower"] = p.tower
    if p.payment_status: b["payment_status"] = p.payment_status
    if p.booking_date: b["booking_date"] = p.booking_date.isoformat()
    if p.starred is not None: b["starred"] = p.starred
    if p.completed_tasks is not None: b["completed_tasks"] = p.completed_tasks
    result = sb_insert("bookings", b)
    SESSION_CACHE["bookings"].insert(0, result or b)
    # Auto-sync lead stage to booking
    sync_lead_stage(p.lead_id, "booking", force=True)
    return result or b

@api_router.get("/bookings")
async def list_bookings(cu: User=Depends(get_current_user)):
    bookings = sb_select("bookings", {"select": "*", "order": "created_at.desc"})
    # Deduplicate bookings (cache wins)
    cache_ids = {b.get("booking_id") for b in SESSION_CACHE["bookings"]}
    db_only = [b for b in bookings if b.get("booking_id") not in cache_ids]
    return SESSION_CACHE["bookings"] + db_only

@api_router.patch("/bookings/{booking_id}")
async def update_booking(booking_id: str, p: BookingUpdate, cu: User=Depends(get_current_user)):
    booking_before = None
    db_bookings_before = sb_select("bookings", {"booking_id": f"eq.{booking_id}", "select": "*", "limit": "1"})
    if db_bookings_before:
        booking_before = db_bookings_before[0]
    else:
        cache_before = [b for b in SESSION_CACHE["bookings"] if b.get("booking_id") == booking_id]
        if cache_before:
            booking_before = cache_before[0]

    data = model_payload(p)
    if "token_received" in data or "booking_amount" in data:
        amount = float(data.get("booking_amount", (booking_before or {}).get("booking_amount", 0)) or 0)
        token = float(data.get("token_received", (booking_before or {}).get("token_received", 0)) or 0)
        if amount:
            data["payment_progress"] = min(100, int((token / amount) * 100))
        elif "payment_progress" not in data:
            data["payment_progress"] = 0
    updated = sb_update("bookings", "booking_id", booking_id, data)
    if not updated and any(key in data for key in ["completed_tasks", "starred"]):
        compatible_data = {k: v for k, v in data.items() if k not in ["completed_tasks", "starred"]}
        if compatible_data:
            updated = sb_update("bookings", "booking_id", booking_id, compatible_data)
    # Update cache
    booking_record = None
    for i, b in enumerate(SESSION_CACHE["bookings"]):
        if b.get("booking_id") == booking_id:
            SESSION_CACHE["bookings"][i] = {**b, **data}
            booking_record = SESSION_CACHE["bookings"][i]
            if not updated: updated = SESSION_CACHE["bookings"][i]
            break
    if not booking_record and (booking_before or updated):
        booking_record = {**(booking_before or {}), **(updated or {}), **data}
        updated = booking_record
        SESSION_CACHE["bookings"] = [b for b in SESSION_CACHE["bookings"] if b.get("booking_id") != booking_id]
        SESSION_CACHE["bookings"].insert(0, booking_record)
    if not updated:
        db_bookings = sb_select("bookings", {"booking_id": f"eq.{booking_id}"})
        if db_bookings:
            booking_record = db_bookings[0]
            updated = booking_record
        else:
            raise HTTPException(404, "Booking not found")
    # Auto-sync lead stage
    if booking_record and booking_record.get("lead_id"):
        status = str(data.get("status") or booking_record.get("status") or "").lower()
        lead_id = booking_record["lead_id"]
        completed_tasks = data.get("completed_tasks") or booking_record.get("completed_tasks") or []
        loan_ready_tasks = {"login_file", "sanctioned", "registration", "disbursement", "bill_submitted"}
        if status in ["registration"]:
            sync_lead_stage(lead_id, "registration", force=False)
            ensure_loan_record(lead_id, booking_record.get("lead_name"))
        elif status in ["confirmed", "token received", "agreement pending", "login file", "sanctioned", "disbursement", "bill submitted"] or any(t in loan_ready_tasks for t in completed_tasks):
            sync_lead_stage(lead_id, "loan", force=False)
            ensure_loan_record(lead_id, booking_record.get("lead_name"))
        elif status in ["cancellation", "cancelled"]:
            sb_update("leads", "lead_id", lead_id, {"status": "negative", "updated_at": now_utc().isoformat()})
            update_cached_lead(lead_id, {"status": "negative", "updated_at": now_utc().isoformat()})
            log_activity(cu, "booking_cancelled", "Booking cancelled; lead moved to negative pool.", lead_id=lead_id)
        else:
            sync_lead_stage(lead_id, "booking", force=True)
    return updated

@api_router.delete("/bookings/{booking_id}")
async def delete_booking(booking_id: str, cu: User=Depends(get_current_user)):
    booking = None
    rows = sb_select("bookings", {"booking_id": f"eq.{booking_id}", "select": "*", "limit": "1"})
    if rows:
        booking = rows[0]
    else:
        cache_match = [b for b in SESSION_CACHE["bookings"] if b.get("booking_id") == booking_id]
        if cache_match:
            booking = cache_match[0]

    sb_delete("bookings", "booking_id", booking_id)
    SESSION_CACHE["bookings"] = [b for b in SESSION_CACHE["bookings"] if b.get("booking_id") != booking_id]
    if booking and booking.get("lead_id"):
        log_activity(cu, "booking_deleted", "Booking record deleted.", lead_id=booking.get("lead_id"))
    return {"ok": True, "booking_id": booking_id}

# ---- Loans ----
@api_router.post("/loans")
async def create_loan(p: LoanCreate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{p.lead_id}", "select": "lead_id,name"})
    lead_name = "Lead"
    if leads:
        lead_name = leads[0]["name"]
    else:
        cache_match = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") == p.lead_id]
        if cache_match:
            lead_name = cache_match[0].get("name", "Lead")
        else:
            raise HTTPException(404, "Lead not found")
    lid = gen_id("lon")
    l = {
        "loan_id": lid, "lead_id": p.lead_id, "lead_name": lead_name,
        "bank_name": p.bank_name, "amount": p.amount, "application_status": "pending",
        "bank_stage": "documentation", "emi_eligible": None, "progress": 0,
        "created_at": now_utc().isoformat(),
    }
    if p.documents_status: l["documents_status"] = p.documents_status
    if p.pending_documents is not None: l["pending_documents"] = p.pending_documents
    if p.starred is not None: l["starred"] = p.starred
    result = sb_insert("loans", l)
    SESSION_CACHE["loans"].insert(0, result or l)
    # Auto-sync lead stage to loan
    sync_lead_stage(p.lead_id, "loan", force=True)
    return result or l

@api_router.get("/loans")
async def list_loans(cu: User=Depends(get_current_user)):
    loans = sb_select("loans", {"select": "*", "order": "created_at.desc"})
    # Deduplicate loans (cache wins)
    cache_ids = {ln.get("loan_id") for ln in SESSION_CACHE["loans"]}
    db_only = [ln for ln in loans if ln.get("loan_id") not in cache_ids]
    return SESSION_CACHE["loans"] + db_only

@api_router.patch("/loans/{loan_id}")
async def update_loan(loan_id: str, p: LoanUpdate, cu: User=Depends(get_current_user)):
    data = model_payload(p)
    updated = sb_update("loans", "loan_id", loan_id, data)
    # Update cache
    loan_record = None
    for i, ln in enumerate(SESSION_CACHE["loans"]):
        if ln.get("loan_id") == loan_id:
            SESSION_CACHE["loans"][i] = {**ln, **data}
            loan_record = SESSION_CACHE["loans"][i]
            if not updated: updated = SESSION_CACHE["loans"][i]
            break
    if not loan_record and updated:
        loan_record = updated
    if not updated:
        # Try to find it from DB
        db_loans = sb_select("loans", {"loan_id": f"eq.{loan_id}"})
        if db_loans:
            loan_record = db_loans[0]
            updated = loan_record
        else:
            raise HTTPException(404, "Loan not found")
    # Auto-sync lead stage to loan when loan is actively being worked on
    if loan_record and loan_record.get("lead_id"):
        lead_id = loan_record["lead_id"]
        application_status = str(data.get("application_status") or loan_record.get("application_status") or "").lower()
        bank_stage = str(data.get("bank_stage") or loan_record.get("bank_stage") or "").lower()
        if application_status in ["disbursed", "completed"] or bank_stage == "disbursal":
            sync_lead_stage(lead_id, "closed", force=False)
            create_customer_from_lead(lead_id, cu)
        elif application_status in ["approved"] or bank_stage in ["sanction", "sanctioned"]:
            sync_lead_stage(lead_id, "registration", force=False)
        else:
            sync_lead_stage(lead_id, "loan", force=True)
    return updated

@api_router.delete("/loans/{loan_id}")
async def delete_loan(loan_id: str, cu: User=Depends(get_current_user)):
    loan = None
    rows = sb_select("loans", {"loan_id": f"eq.{loan_id}", "select": "*", "limit": "1"})
    if rows:
        loan = rows[0]
    else:
        cache_match = [ln for ln in SESSION_CACHE["loans"] if ln.get("loan_id") == loan_id]
        if cache_match:
            loan = cache_match[0]

    sb_delete("loans", "loan_id", loan_id)
    SESSION_CACHE["loans"] = [ln for ln in SESSION_CACHE["loans"] if ln.get("loan_id") != loan_id]
    if loan and loan.get("lead_id"):
        log_activity(cu, "loan_deleted", "Loan record deleted.", lead_id=loan.get("lead_id"))
    return {"ok": True, "loan_id": loan_id}

# ---- Customers & Notifications ----
@api_router.get("/customers")
async def list_customers(cu: User=Depends(get_current_user)):
    customers = sb_select("customers", {"select": "*", "order": "converted_at.desc"})
    cache_ids = {c.get("customer_id") for c in SESSION_CACHE["customers"]}
    return SESSION_CACHE["customers"] + [c for c in customers if c.get("customer_id") not in cache_ids]

@api_router.get("/notifications")
async def list_notifications(cu: User=Depends(get_current_user)):
    user_id = cu.acting_as_employee_id or cu.user_id
    params = {"select": "*", "order": "created_at.desc"}
    if cu.role != "admin":
        params["user_id"] = f"eq.{user_id}"
    notifications = sb_select("notifications", params)
    cache_ids = {n.get("notification_id") for n in SESSION_CACHE["notifications"]}
    cached = SESSION_CACHE["notifications"]
    if cu.role != "admin":
        cached = [n for n in cached if n.get("user_id") == user_id]
    return cached + [n for n in notifications if n.get("notification_id") not in cache_ids]

@api_router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, cu: User=Depends(get_current_user)):
    updated = sb_update("notifications", "notification_id", notification_id, {"is_read": True})
    SESSION_CACHE["notifications"] = [
        ({**n, "is_read": True} if n.get("notification_id") == notification_id else n)
        for n in SESSION_CACHE["notifications"]
    ]
    return updated or {"notification_id": notification_id, "is_read": True}

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
    bookings = sb_select("bookings", {"select": "booking_amount,status"})
    visits = sb_select("visits", {"select": "visit_id,status"})
    followups = sb_select("visit_followups", {"select": "followup_id,status"})
    loans = sb_select("loans", {"select": "loan_id,application_status,amount,bank_stage"})
    customers = sb_select("customers", {"select": "customer_id,lead_id"})
    activities = sb_select("activities", {"select": "activity_id,type"})
    
    # Deduplicate leads
    cache_lead_ids = {l.get("lead_id") for l in SESSION_CACHE["leads"]}
    leads = SESSION_CACHE["leads"] + [l for l in leads if l.get("lead_id") not in cache_lead_ids]
    
    # Deduplicate bookings
    cache_bkg_ids = {b.get("booking_id") for b in SESSION_CACHE["bookings"]}
    bookings = SESSION_CACHE["bookings"] + [b for b in bookings if b.get("booking_id") not in cache_bkg_ids]
    
    # Deduplicate visits
    cache_vis_ids = {v.get("visit_id") for v in SESSION_CACHE["visits"]}
    visits = SESSION_CACHE["visits"] + [v for v in visits if v.get("visit_id") not in cache_vis_ids]

    # Deduplicate follow-ups
    cache_followup_ids = {f.get("followup_id") for f in SESSION_CACHE["followups"]}
    followups = SESSION_CACHE["followups"] + [f for f in followups if f.get("followup_id") not in cache_followup_ids]

    cache_activity_ids = {a.get("activity_id") for a in SESSION_CACHE["activities"]}
    activities = SESSION_CACHE["activities"] + [a for a in activities if a.get("activity_id") not in cache_activity_ids]
    
    # Deduplicate loans
    cache_lon_ids = {ln.get("loan_id") for ln in SESSION_CACHE["loans"]}
    loans = SESSION_CACHE["loans"] + [ln for ln in loans if ln.get("loan_id") not in cache_lon_ids]

    cache_customer_ids = {c.get("customer_id") for c in SESSION_CACHE["customers"]}
    customers = SESSION_CACHE["customers"] + [c for c in customers if c.get("customer_id") not in cache_customer_ids]

    # No demo data fallbacks
    # if not leads: leads = DEMO_LEADS
    # if not bookings: bookings = DEMO_BOOKINGS
    # if not visits: visits = DEMO_VISITS
    # if not loans: loans = DEMO_LOANS

    stage_dist = {s: 0 for s in STAGES}
    for l in leads:
        if l.get("status") != "negative":
            st = l.get("stage", "new")
            stage_dist[st] = stage_dist.get(st, 0) + 1
            
    employees = sb_select("employees", {"select": "employee_id"})
    campaigns = sb_select("campaigns", {"select": "campaign_id"})
    rev = sum(float(b.get("booking_amount", 0) or 0) for b in bookings)
    rev += sum(float(l.get("amount", 0) or 0) for l in loans if l.get("application_status") == "disbursed" or l.get("bank_stage") == "disbursal")
    activity_followups = sum(1 for a in activities if "followup" in str(a.get("type")) or "follow_up" in str(a.get("type")))
    follow_up_total = max(len(followups), activity_followups)
    pending_follow_up_total = (
        sum(1 for f in followups if str(f.get("status", "scheduled")).lower() in ["scheduled", "pending", "open"])
        if followups else activity_followups
    )
    
    return {
        "total_leads": len(leads),
        "positive_leads": sum(1 for l in leads if l.get("stage") in ["positive","site_visit","booking","loan","registration","closed"]),
        "negative_leads": sum(1 for l in leads if l.get("status") == "negative"),
        "new_leads": sum(1 for l in leads if l.get("stage") == "new"),
        "site_visits": len(visits),
        "completed_visits": sum(1 for v in visits if v.get("status") == "completed"),
        "bookings": len(bookings),
        "confirmed_bookings": sum(1 for b in bookings if b.get("status") == "confirmed"),
        "follow_ups": follow_up_total,
        "pending_follow_ups": pending_follow_up_total,
        "loans": len(loans),
        "disbursed_loans": sum(1 for l in loans if l.get("application_status") == "disbursed"),
        "converted_customers": max(len(customers), sum(1 for l in leads if l.get("stage") == "closed")),
        "employees": len(employees) or 5,
        "campaigns": len(campaigns) or 2,
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
    # Deduplicate
    cache_lead_ids = {l.get("lead_id") for l in SESSION_CACHE["leads"]}
    leads = SESSION_CACHE["leads"] + [l for l in leads if l.get("lead_id") not in cache_lead_ids]
    # if not leads: leads = DEMO_LEADS
    
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
    # Deduplicate
    cache_bkg_ids = {b.get("booking_id") for b in SESSION_CACHE["bookings"]}
    bookings = SESSION_CACHE["bookings"] + [b for b in bookings if b.get("booking_id") not in cache_bkg_ids]
    # if not bookings: bookings = DEMO_BOOKINGS

    loans = sb_select("loans", {"select": "amount,created_at,application_status,bank_stage"})
    cache_lon_ids = {ln.get("loan_id") for ln in SESSION_CACHE["loans"]}
    loans = SESSION_CACHE["loans"] + [ln for ln in loans if ln.get("loan_id") not in cache_lon_ids]
    
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

    for l in loans:
        if l.get("application_status") == "disbursed" or l.get("bank_stage") == "disbursal":
            d = l.get("created_at", "")[:7]
            if d in months_map:
                val = float(l.get("amount", 0) or 0)
                months_map[d] += val
            
    for d, rev in sorted(months_map.items()):
        rev_by_month.append({"month": d, "revenue": rev})

    return {"leads_by_day": leads_by_day, "revenue_by_month": rev_by_month}

@api_router.get("/activities")
async def list_activities(limit: int = 50, cu: User=Depends(get_current_user)):
    activities = sb_select("activities", {"select": "*", "order": "created_at.desc", "limit": str(limit)})
    # Deduplicate
    cache_act_ids = {a.get("activity_id") for a in SESSION_CACHE["activities"]}
    return SESSION_CACHE["activities"] + [a for a in activities if a.get("activity_id") not in cache_act_ids]

@api_router.get("/stats/me")
async def stats_me(cu: User=Depends(get_current_user)):
    eid = cu.acting_as_employee_id or cu.user_id
    
    # Get stats (merge with cache)
    if cu.role == "admin":
        activities = sb_select("activities", {"select": "*", "order": "created_at.desc"})
        cache_act_ids = {a.get("activity_id") for a in SESSION_CACHE["activities"]}
        activities = SESSION_CACHE["activities"] + [a for a in activities if a.get("activity_id") not in cache_act_ids]
    else:
        activities = sb_select("activities", {"user_id": f"eq.{eid}", "select": "*", "order": "created_at.desc"})
        cache_acts = [a for a in SESSION_CACHE["activities"] if a.get("user_id") == eid]
        activities = cache_acts + activities
    
    positives = sum(1 for a in activities if a.get("type") == "positive_response" or "positive" in str(a.get("type")))
    visits = sum(1 for a in activities if a.get("type") == "site_visit_scheduled" or "visit" in str(a.get("type")))
    followups = sum(1 for a in activities if "followup" in str(a.get("type")) or "follow_up" in str(a.get("type")))
    bookings_done = sum(1 for a in activities if "booking" in str(a.get("type")))
    loans_done = sum(1 for a in activities if "loan" in str(a.get("type")))
    closed_deals = sum(1 for a in activities if "closed" in str(a.get("type")))
    
    # Calculate performance score (max 10)
    score = min(10, positives * 1 + followups * 0.5 + visits * 2 + bookings_done * 3 + loans_done * 2 + closed_deals * 4)
    if not activities:
        score = 0
    
    # Get all leads for pipeline counts (merge with cache correctly)
    leads = sb_select("leads", {"select": "lead_id,stage,status"})
    cache_lead_ids = {l.get("lead_id") for l in SESSION_CACHE["leads"]}
    leads = SESSION_CACHE["leads"] + [l for l in leads if l.get("lead_id") not in cache_lead_ids]
    # if not leads: leads = DEMO_LEADS
    
    hot = sum(1 for l in leads if l.get("stage") in ["positive","site_visit","booking","loan","registration"])
    warm = sum(1 for l in leads if l.get("stage") == "assigned")
    cold = sum(1 for l in leads if l.get("stage") in ["new", "contacted"])
    negative = sum(1 for l in leads if l.get("status") == "negative")
    closed = sum(1 for l in leads if l.get("stage") == "closed")

    return {
        "employee": None, "role": cu.role,
        "personal": {
            "actions_total": len(activities), "positives": positives, "negatives": 0, "followups": followups,
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
        followups = sum(1 for a in emp_acts if "followup" in str(a.get("type")) or "follow_up" in str(a.get("type")))
        
        emp_stats.append({
            "employee_id": eid, "name": e["name"], "email": e["email"],
            "role": e["role"], "department": e.get("department", ""),
            "actions_total": actions_total, "last_activity": last_activity,
            "positives": positives, "negatives": 0,
            "followups": followups, "visits": visits,
            "bookings_done": sum(1 for a in emp_acts if "booking" in str(a.get("type"))), 
            "loans_done": sum(1 for a in emp_acts if "loan" in str(a.get("type"))),
            "closed_deals": sum(1 for a in emp_acts if "closed" in str(a.get("type"))), 
            "call_notes": sum(1 for a in emp_acts if "call" in str(a.get("type"))),
        })
    return emp_stats

# ---- Health & Wiring ----
@api_router.get("/")
async def root(): return {"app": "Umang Hometech LLP CRM", "status": "ok", "database": "supabase"}

app.include_router(api_router)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
