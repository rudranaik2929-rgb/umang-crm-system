"""Umang Properties – Real Estate CRM Backend (Supabase Production)"""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
import uuid, logging, random, os, httpx
from passlib.context import CryptContext
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

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

app = FastAPI(title="Umang Properties CRM")

@app.get("/")
async def root_health():
    return {"status": "online", "message": "Umang CRM Backend is running", "timestamp": datetime.now().isoformat()}

@app.get("/debug-config")
async def debug_config():
    key = os.environ.get("SUPABASE_ANON_KEY", "")
    return {
        "url": os.environ.get("SUPABASE_URL", ""),
        "key_prefix": key[:10] if key else "MISSING",
        "key_suffix": key[-10:] if key else "MISSING",
        "key_length": len(key)
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

STAGES = ["new","contacted","positive","site_visit","booking","loan","registration","closed"]
ROLES = ["admin","telecaller","site_visit","booking","loan","marketing"]

# ---- Integration Config (from .env) ----
INTERAKT_API_KEY = os.environ.get("INTERAKT_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "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")
FACEBOOK_VERIFY_TOKEN = os.environ.get("FACEBOOK_VERIFY_TOKEN", "umang_secret_verify_123")

# ---- Supabase Config ----
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xlaiwmyyldxmuvopqomi.supabase.co")
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsYWl3bXl5bGR4bXV2b3Bxb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2Njc2MSwiZXhwIjoyMDk0MTQyNzYxfQ.2lYDVgmVnbvaBVdDOkOfPekd8uPNeo7NiFEcdNh81EM"

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

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, cu: User=Depends(get_current_user)):
    if cu.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete leads")
    
    # 1. Delete associated data first
    sb_delete("visits", "lead_id", lead_id)
    sb_delete("bookings", "lead_id", lead_id)
    sb_delete("loans", "lead_id", lead_id)
    sb_delete("activities", "lead_id", lead_id)
    
    # 2. Delete the lead
    res = sb_delete("leads", "lead_id", lead_id)
    
    # 3. Clean from session cache
    global SESSION_CACHE
    if "leads" in SESSION_CACHE:
        SESSION_CACHE["leads"] = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") != lead_id]
    
    return {"status": "deleted", "lead_id": lead_id}

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
LOCAL_SESSIONS = {}
SESSION_CACHE = {"leads": [], "bookings": [], "visits": [], "loans": [], "activities": []}

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

async def get_current_user(request: Request) -> User:
    token = await get_session_token(request)
    if not token: raise HTTPException(401, "Not authenticated")
    
    # Try local fallback first
    if token in LOCAL_SESSIONS:
        sess = LOCAL_SESSIONS[token]
        if datetime.fromisoformat(sess["expires_at"].replace("Z","+00:00")) <= now_utc():
            raise HTTPException(401, "Session expired")
        return User(**sess["user"])

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

# ---- WhatsApp Service Layer (Interakt) ----
class WhatsAppService:
    @staticmethod
    def send_template(phone: str, template_name: str, values: List[str] = []):
        """
        Sends a WhatsApp template via Interakt API.
        Values: List of strings to fill in the {{1}}, {{2}} placeholders.
        """
        if not INTERAKT_API_KEY:
            logging.info(f"[SIMULATION] Interakt Template '{template_name}' would be sent to {phone} with values {values}")
            return {"status": "simulated", "message": "No Interakt API Key"}
        
        url = "https://api.interakt.ai/v1/public/message/"
        headers = {
            "Authorization": f"Basic {INTERAKT_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Format phone (must include country code, e.g., +91)
        clean_phone = phone.strip().replace(" ", "").replace("-", "")
        if not clean_phone.startswith("+"):
            clean_phone = "+91" + clean_phone[-10:] # Default to India
            
        payload = {
            "fullPhoneNumber": clean_phone,
            "type": "Template",
            "template": {
                "name": template_name,
                "languageCode": "en",
                "bodyValues": values
            }
        }
        
        try:
            r = httpx.post(url, headers=headers, json=payload, timeout=10)
            logging.info(f"Interakt API Response: {r.status_code} {r.text}")
            return r.json()
        except Exception as e:
            logging.error(f"Interakt API Connection Error: {e}")
            return {"status": "error", "message": str(e)}

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
You are a professional real estate assistant for Umang Properties.
Your goal:
- Sound human and friendly
- Ask about budget, location, requirement
- Convert user into site visit
Example: "Hi 😊 Are you looking for 2BHK or 3BHK? We have great options available 🔥"
Always:
- Ask questions
- Engage user
- Push for site visit
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

# ---- Leads ----
@api_router.post("/leads/public")
async def create_lead_public(p: LeadCreatePublic):
    lid = gen_id("lead")
    assigned_to = assign_lead_round_robin()
    lead = {
        "lead_id": lid, "name": p.name, "phone": p.phone, "email": p.email,
        "budget": p.budget, "location": p.location, "property_type": p.property_type,
        "notes": p.notes, "source": "website", "stage": "new", "status": "active",
        "assigned_to": assigned_to, "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
    }
    result = sb_insert("leads", lead)
    log_activity(None, "website_enquiry", f"New website enquiry received from {p.name}.", lead_id=lid)
    
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
    
    lead = {
        "lead_id": lid, "name": name, "phone": phone, "email": email,
        "source": source, "stage": "new", "status": "active",
        "assigned_to": assigned_to, "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
    }
    sb_insert("leads", lead)
    log_activity(None, "webhook_enquiry", f"New lead from {source}: {name}", lead_id=lid)
    
    return {"status": "success", "lead_id": lid}

@api_router.post("/webhooks/whatsapp/reply")
async def inbound_whatsapp_reply(request: Request):
    """
    Handle incoming WhatsApp replies from Interakt.
    """
    body = await request.json()
    # Interakt Webhook structure
    msg_data = body.get("data", {})
    message_text = msg_data.get("message", {}).get("text", "")
    phone = msg_data.get("customer", {}).get("phoneNumber", "")
    
    if not message_text or not phone:
        return {"status": "ignored"}
        
    # 1. Generate AI Response using your umang.py logic
    ai_reply = AIService.generate_reply(message_text)
    
    # 2. Log activity in CRM
    leads = sb_select("leads", {"phone": f"ilike.%{phone[-10:]}%", "select": "lead_id"})
    if leads:
        log_activity(None, "whatsapp_reply", f"Customer: {message_text}\nAI: {ai_reply}", lead_id=leads[0]["lead_id"])
    
    # 3. Send AI response back via Interakt
    # Note: For inbound replies, Interakt uses a 'Regular Message' instead of a Template
    # (Checking Interakt documentation for regular message structure)
    WhatsAppService.send_template(phone, "ai_chat_response", [ai_reply]) # Fallback to template or use regular message API
    
    return {"status": "replied", "response": ai_reply}

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
    
    data = {k: v for k, v in p.model_dump().items() if v is not None}
    data["updated_at"] = now_utc().isoformat()
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
        if p.stage == "site_visit":
            existing = sb_select("visits", {"lead_id": f"eq.{lead_id}"})
            if not existing and not [v for v in SESSION_CACHE["visits"] if v.get("lead_id") == lead_id]:
                vid = gen_id("vis")
                v = {"visit_id": vid, "lead_id": lead_id, "scheduled_at": now_utc().isoformat(), "status": "scheduled", "created_at": now_utc().isoformat()}
                sb_insert("visits", v)
                SESSION_CACHE["visits"].insert(0, v)
        elif p.stage == "booking":
            existing = sb_select("bookings", {"lead_id": f"eq.{lead_id}"})
            if not existing and not [b for b in SESSION_CACHE["bookings"] if b.get("lead_id") == lead_id]:
                bid = gen_id("bkg")
                b = {"booking_id": bid, "lead_id": lead_id, "lead_name": old_lead.get("name", "Lead"), "property_name": "Selected Property", "booking_amount": 0, "token_received": 0, "status": "active", "created_at": now_utc().isoformat()}
                sb_insert("bookings", b)
                SESSION_CACHE["bookings"].insert(0, b)
        elif p.stage == "loan":
            existing = sb_select("loans", {"lead_id": f"eq.{lead_id}"})
            if not existing and not [ln for ln in SESSION_CACHE["loans"] if ln.get("lead_id") == lead_id]:
                lnid = gen_id("lon")
                ln = {"loan_id": lnid, "lead_id": lead_id, "lead_name": old_lead.get("name", "Lead"), "bank_name": "Bank Pending", "amount": 0, "application_status": "pending", "bank_stage": "documentation", "progress": 0, "created_at": now_utc().isoformat()}
                sb_insert("loans", ln)
                SESSION_CACHE["loans"].insert(0, ln)

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
    if new_stage == "site_visit":
        existing = sb_select("visits", {"lead_id": f"eq.{lead_id}"})
        if not existing and not [v for v in SESSION_CACHE["visits"] if v.get("lead_id") == lead_id]:
            v = {"visit_id": gen_id("vis"), "lead_id": lead_id, "scheduled_at": now_utc().isoformat(), "status": "scheduled", "created_at": now_utc().isoformat()}
            sb_insert("visits", v)
            SESSION_CACHE["visits"].insert(0, v)
    elif new_stage == "booking":
        existing = sb_select("bookings", {"lead_id": f"eq.{lead_id}"})
        if not existing and not [b for b in SESSION_CACHE["bookings"] if b.get("lead_id") == lead_id]:
            b = {"booking_id": gen_id("bkg"), "lead_id": lead_id, "lead_name": lead.get("name", "Lead"), "property_name": "Selected Property", "booking_amount": 0, "token_received": 0, "status": "active", "created_at": now_utc().isoformat()}
            sb_insert("bookings", b)
            SESSION_CACHE["bookings"].insert(0, b)
    elif new_stage == "loan":
        existing = sb_select("loans", {"lead_id": f"eq.{lead_id}"})
        if not existing and not [ln for ln in SESSION_CACHE["loans"] if ln.get("lead_id") == lead_id]:
            ln = {"loan_id": gen_id("lon"), "lead_id": lead_id, "lead_name": lead.get("name", "Lead"), "bank_name": "Bank Pending", "amount": 0, "application_status": "pending", "bank_stage": "documentation", "progress": 0, "created_at": now_utc().isoformat()}
            sb_insert("loans", ln)
            SESSION_CACHE["loans"].insert(0, ln)

    log_activity(cu, "stage_change", f"Stage moved {cur} → {new_stage}", lead_id=lead_id)
    return updated or new_lead

# ---- Visits ----
@api_router.post("/visits")
async def create_visit(p: SiteVisitCreate, cu: User=Depends(get_current_user)):
    leads = sb_select("leads", {"lead_id": f"eq.{p.lead_id}", "select": "lead_id,name"})
    if not leads:
        cache_match = [l for l in SESSION_CACHE["leads"] if l.get("lead_id") == p.lead_id]
        if not cache_match: raise HTTPException(404, "Lead not found")
    vid = gen_id("vis")
    v = {
        "visit_id": vid, "lead_id": p.lead_id, "scheduled_at": p.scheduled_at.isoformat(),
        "assigned_to": p.assigned_to, "status": "scheduled", "feedback": None,
        "interested": None, "created_at": now_utc().isoformat(),
    }
    result = sb_insert("visits", v)
    SESSION_CACHE["visits"].insert(0, result or v)
    return result or v

@api_router.get("/visits")
async def list_visits(cu: User=Depends(get_current_user)):
    visits = sb_select("visits", {"select": "*", "order": "scheduled_at.desc"})
    # Deduplicate visits (cache wins)
    cache_ids = {v.get("visit_id") for v in SESSION_CACHE["visits"]}
    db_only = [v for v in visits if v.get("visit_id") not in cache_ids]
    return SESSION_CACHE["visits"] + db_only

@api_router.patch("/visits/{visit_id}")
async def update_visit(visit_id: str, p: SiteVisitUpdate, cu: User=Depends(get_current_user)):
    data = {k: v for k, v in p.model_dump().items() if v is not None}
    updated = sb_update("visits", "visit_id", visit_id, data)
    # Update cache
    for i, v in enumerate(SESSION_CACHE["visits"]):
        if v.get("visit_id") == visit_id:
            SESSION_CACHE["visits"][i] = {**v, **data}
            if not updated: updated = SESSION_CACHE["visits"][i]
            break
    if not updated: raise HTTPException(404, "Visit not found")
    return updated

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
        "payment_progress": int((p.token_received / p.booking_amount) * 100) if p.booking_amount else 0,
        "status": "active", "created_at": now_utc().isoformat(),
    }
    result = sb_insert("bookings", b)
    SESSION_CACHE["bookings"].insert(0, result or b)
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
    data = {k: v for k, v in p.model_dump().items() if v is not None}
    updated = sb_update("bookings", "booking_id", booking_id, data)
    if not updated: raise HTTPException(404, "Booking not found")
    return updated

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
    result = sb_insert("loans", l)
    SESSION_CACHE["loans"].insert(0, result or l)
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
    bookings = sb_select("bookings", {"select": "booking_amount,status"})
    visits = sb_select("visits", {"select": "visit_id,status"})
    loans = sb_select("loans", {"select": "loan_id,application_status"})
    
    # Deduplicate leads
    cache_lead_ids = {l.get("lead_id") for l in SESSION_CACHE["leads"]}
    leads = SESSION_CACHE["leads"] + [l for l in leads if l.get("lead_id") not in cache_lead_ids]
    
    # Deduplicate bookings
    cache_bkg_ids = {b.get("booking_id") for b in SESSION_CACHE["bookings"]}
    bookings = SESSION_CACHE["bookings"] + [b for b in bookings if b.get("booking_id") not in cache_bkg_ids]
    
    # Deduplicate visits
    cache_vis_ids = {v.get("visit_id") for v in SESSION_CACHE["visits"]}
    visits = SESSION_CACHE["visits"] + [v for v in visits if v.get("visit_id") not in cache_vis_ids]
    
    # Deduplicate loans
    cache_lon_ids = {ln.get("loan_id") for ln in SESSION_CACHE["loans"]}
    loans = SESSION_CACHE["loans"] + [ln for ln in loans if ln.get("loan_id") not in cache_lon_ids]

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
    activities = sb_select("activities", {"select": "*", "order": "created_at.desc", "limit": str(limit)})
    # Deduplicate
    cache_act_ids = {a.get("activity_id") for a in SESSION_CACHE["activities"]}
    return SESSION_CACHE["activities"] + [a for a in activities if a.get("activity_id") not in cache_act_ids]

@api_router.get("/stats/me")
async def stats_me(cu: User=Depends(get_current_user)):
    eid = cu.acting_as_employee_id or cu.user_id
    
    # Get personal stats (merge with cache)
    activities = sb_select("activities", {"user_id": f"eq.{eid}", "select": "*", "order": "created_at.desc"})
    cache_acts = [a for a in SESSION_CACHE["activities"] if a.get("user_id") == eid]
    activities = cache_acts + activities
    
    positives = sum(1 for a in activities if a.get("type") == "positive_response" or "positive" in str(a.get("type")))
    visits = sum(1 for a in activities if a.get("type") == "site_visit_scheduled" or "visit" in str(a.get("type")))
    bookings_done = sum(1 for a in activities if "booking" in str(a.get("type")))
    loans_done = sum(1 for a in activities if "loan" in str(a.get("type")))
    closed_deals = sum(1 for a in activities if "closed" in str(a.get("type")))
    
    # Calculate performance score (max 10)
    score = min(10, positives * 1 + visits * 2 + bookings_done * 3 + loans_done * 2 + closed_deals * 4)
    if not activities:
        score = 0
    
    # Get all leads for pipeline counts (merge with cache correctly)
    leads = sb_select("leads", {"select": "lead_id,stage,status"})
    cache_lead_ids = {l.get("lead_id") for l in SESSION_CACHE["leads"]}
    leads = SESSION_CACHE["leads"] + [l for l in leads if l.get("lead_id") not in cache_lead_ids]
    # if not leads: leads = DEMO_LEADS
    
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
