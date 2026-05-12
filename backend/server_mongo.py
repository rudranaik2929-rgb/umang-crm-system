"""Umang Properties – Real Estate CRM Backend"""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.getenv('DB_NAME', 'umang')]



app = FastAPI(title="Umang Properties CRM")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8081", "http://localhost:19006", "http://localhost:3000", "https://umang-crm.preview.emergentagent.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api_router = APIRouter(prefix="/api")

# ============================================================
# CONSTANTS
# ============================================================
STAGES = ["new", "contacted", "positive", "site_visit", "booking", "loan", "registration", "closed"]
ROLES = ["admin", "telecaller", "site_visit", "booking", "loan", "marketing"]

# ============================================================
# UTILS
# ============================================================
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def gen_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

# ============================================================
# MODELS
# ============================================================
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: Optional[str] = None  # one of ROLES, set after first login
    acting_as_employee_id: Optional[str] = None  # admin can act on behalf of an employee
    created_at: datetime

class Lead(BaseModel):
    lead_id: str
    name: str
    phone: str
    email: Optional[str] = None
    budget: Optional[str] = None
    location: Optional[str] = None
    property_type: Optional[str] = None
    source: str = "website"
    stage: str = "new"           # workflow stage
    status: str = "active"        # active | negative | closed
    assigned_to: Optional[str] = None  # user_id
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class LeadCreatePublic(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    budget: Optional[str] = None
    location: Optional[str] = None
    property_type: Optional[str] = None
    notes: Optional[str] = None

class LeadUpdate(BaseModel):
    stage: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    budget: Optional[str] = None
    location: Optional[str] = None
    property_type: Optional[str] = None

class TimelineEntry(BaseModel):
    entry_id: str
    lead_id: str
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    type: str   # call_note | stage_change | visit | booking | loan | system
    text: str
    meta: Optional[Dict[str, Any]] = None
    created_at: datetime

class NoteCreate(BaseModel):
    text: str
    type: str = "call_note"

class SiteVisit(BaseModel):
    visit_id: str
    lead_id: str
    lead_name: str
    scheduled_at: datetime
    assigned_to: Optional[str] = None
    assigned_name: Optional[str] = None
    status: str = "scheduled"   # scheduled | completed | rescheduled | cancelled
    feedback: Optional[str] = None
    interested: Optional[bool] = None
    created_at: datetime

class SiteVisitCreate(BaseModel):
    lead_id: str
    scheduled_at: datetime
    assigned_to: Optional[str] = None

class SiteVisitUpdate(BaseModel):
    status: Optional[str] = None
    feedback: Optional[str] = None
    interested: Optional[bool] = None
    scheduled_at: Optional[datetime] = None
    assigned_to: Optional[str] = None

class Booking(BaseModel):
    booking_id: str
    lead_id: str
    lead_name: str
    property_name: str
    booking_amount: float
    token_received: float = 0
    agreement_status: str = "pending"  # pending | signed | cancelled
    payment_progress: int = 0  # %
    status: str = "active"     # active | confirmed | cancelled
    created_at: datetime

class BookingCreate(BaseModel):
    lead_id: str
    property_name: str
    booking_amount: float
    token_received: float = 0

class BookingUpdate(BaseModel):
    token_received: Optional[float] = None
    agreement_status: Optional[str] = None
    payment_progress: Optional[int] = None
    status: Optional[str] = None

class LoanApp(BaseModel):
    loan_id: str
    lead_id: str
    lead_name: str
    bank_name: Optional[str] = None
    amount: float
    application_status: str = "pending"  # pending | submitted | approved | disbursed | rejected
    bank_stage: str = "documentation"     # documentation | verification | sanction | disbursal
    pending_documents: List[str] = []
    emi_eligible: Optional[bool] = None
    progress: int = 0  # %
    created_at: datetime

class LoanCreate(BaseModel):
    lead_id: str
    amount: float
    bank_name: Optional[str] = None

class LoanUpdate(BaseModel):
    bank_name: Optional[str] = None
    application_status: Optional[str] = None
    bank_stage: Optional[str] = None
    pending_documents: Optional[List[str]] = None
    emi_eligible: Optional[bool] = None
    progress: Optional[int] = None

class Employee(BaseModel):
    employee_id: str
    name: str
    email: str
    phone: Optional[str] = None
    role: str
    department: str
    active: bool = True
    leads_assigned: int = 0
    leads_closed: int = 0
    last_login: Optional[datetime] = None
    created_at: datetime

class EmployeeCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    role: str
    department: str

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    active: Optional[bool] = None

class Campaign(BaseModel):
    campaign_id: str
    name: str
    template_id: Optional[str] = None
    audience: str = "all"   # all | positive | negative | by_stage
    audience_filter: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    status: str = "draft"   # draft | scheduled | sent | failed
    sent_count: int = 0
    delivered_count: int = 0
    read_count: int = 0
    replied_count: int = 0
    created_at: datetime

class CampaignCreate(BaseModel):
    name: str
    template_id: Optional[str] = None
    audience: str = "all"
    audience_filter: Optional[str] = None
    scheduled_at: Optional[datetime] = None

class CampaignAction(BaseModel):
    action: Literal["send", "schedule"]

class Template(BaseModel):
    template_id: str
    name: str
    body: str
    created_at: datetime

class TemplateCreate(BaseModel):
    name: str
    body: str

class RoleSet(BaseModel):
    role: str

class ActAs(BaseModel):
    employee_id: Optional[str] = None  # None to clear (act as self)

# ============================================================
# AUTH
# ============================================================
async def get_session_token(request: Request) -> Optional[str]:
    token = request.cookies.get("session_token")
    if token:
        return token
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth[7:]
    return None

async def get_current_user(request: Request) -> User:
    token = await get_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user_doc)

async def get_optional_user(request: Request) -> Optional[User]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None# ------------------------------------------------------------
# AUTH ENDPOINTS
# ------------------------------------------------------------
@api_router.post("/auth/session")
async def auth_session(request: Request, response: Response):
    """Local username/password login for demo."""
    body = await request.json()
    email = body.get("email")
    password = body.get("password")
    
    if email == "umang@admin" and password == "umang@admin":
        user_email = "umang@admin"
        name = "Umang Admin"
        role = "admin"
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    user = await db.users.find_one({"email": user_email}, {"_id": 0})
    if not user:
        user_id = gen_id("user")
        new_user = {
            "user_id": user_id,
            "email": user_email,
            "name": name,
            "picture": None,
            "role": role,
            "created_at": now_utc(),
        }
        await db.users.insert_one(new_user)
        user = new_user
    else:
        user_id = user["user_id"]
        
    session_token = gen_id("session")
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=7),
    })
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    user.pop("_id", None)
    return {
        "user": User(**user).model_dump(mode="json"),
        "session_token": session_token,
    }

@api_router.get("/auth/me")
async def auth_me(current_user: User = Depends(get_current_user)):
    return current_user.model_dump(mode="json")

@api_router.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    token = await get_session_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

@api_router.post("/auth/set-role")
async def auth_set_role(payload: RoleSet, current_user: User = Depends(get_current_user)):
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    await db.users.update_one({"user_id": current_user.user_id}, {"$set": {"role": payload.role}})
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    return User(**user_doc).model_dump(mode="json")

@api_router.post("/auth/act-as")
async def auth_act_as(payload: ActAs, current_user: User = Depends(get_current_user)):
    """Admin can 'act as' an employee — actions performed get credited to that employee."""
    if payload.employee_id:
        emp = await db.employees.find_one({"employee_id": payload.employee_id}, {"_id": 0})
        if not emp:
            raise HTTPException(status_code=404, detail="Employee not found")
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"acting_as_employee_id": payload.employee_id}},
    )
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    return User(**user_doc).model_dump(mode="json")

# ============================================================
# ACTIVITY LOG HELPER
# ============================================================
async def log_activity(actor: Optional[User], type_: str, text: str, lead_id: Optional[str] = None, meta: Optional[Dict[str, Any]] = None):
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    employee_role: Optional[str] = None
    if actor and getattr(actor, "acting_as_employee_id", None):
        emp = await db.employees.find_one({"employee_id": actor.acting_as_employee_id}, {"_id": 0})
        if emp:
            employee_id = emp["employee_id"]
            employee_name = emp["name"]
            employee_role = emp.get("role")

    display_name = employee_name or (actor.name if actor else "System")
    display_role = employee_role or (actor.role if actor else "system")

    entry = {
        "entry_id": gen_id("act"),
        "lead_id": lead_id,
        "actor_id": actor.user_id if actor else None,
        "actor_name": display_name,
        "actor_role": display_role,
        "employee_id": employee_id,
        "employee_name": employee_name,
        "type": type_,
        "text": text,
        "meta": meta or {},
        "created_at": now_utc(),
    }
    await db.activities.insert_one(entry)
    return entry

# ============================================================
# LEADS
# ============================================================
@api_router.post("/leads/public")
async def create_lead_public(payload: LeadCreatePublic):
    lead = Lead(
        lead_id=gen_id("lead"),
        name=payload.name,
        phone=payload.phone,
        email=payload.email,
        budget=payload.budget,
        location=payload.location,
        property_type=payload.property_type,
        notes=payload.notes,
        source="website",
        stage="new",
        status="active",
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    await db.leads.insert_one(lead.model_dump())
    await log_activity(None, "system", f"New lead enquiry from {lead.name}", lead_id=lead.lead_id)
    return lead.model_dump(mode="json")

@api_router.get("/leads")
async def list_leads(
    stage: Optional[str] = None,
    status_: Optional[str] = None,
    assigned_to: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if stage:
        q["stage"] = stage
    if status_:
        q["status"] = status_
    if assigned_to:
        q["assigned_to"] = assigned_to
    leads = await db.leads.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return leads

@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, current_user: User = Depends(get_current_user)):
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    timeline = await db.activities.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"lead": lead, "timeline": timeline}

@api_router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, payload: LeadUpdate, current_user: User = Depends(get_current_user)):
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        return lead
    update_data["updated_at"] = now_utc()
    await db.leads.update_one({"lead_id": lead_id}, {"$set": update_data})

    if "stage" in update_data and update_data["stage"] != lead.get("stage"):
        await log_activity(current_user, "stage_change",
                           f"Stage moved {lead.get('stage')} → {update_data['stage']}", lead_id=lead_id)
    if "status" in update_data and update_data["status"] != lead.get("status"):
        await log_activity(current_user, "stage_change",
                           f"Status changed to {update_data['status']}", lead_id=lead_id)
    if "assigned_to" in update_data:
        await log_activity(current_user, "system",
                           f"Assigned to user {update_data['assigned_to']}", lead_id=lead_id)
    new_lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    return new_lead

@api_router.post("/leads/{lead_id}/notes")
async def add_lead_note(lead_id: str, payload: NoteCreate, current_user: User = Depends(get_current_user)):
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    entry = await log_activity(current_user, payload.type, payload.text, lead_id=lead_id)
    entry.pop("_id", None)
    return entry

@api_router.post("/leads/{lead_id}/advance")
async def advance_lead(lead_id: str, current_user: User = Depends(get_current_user)):
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    cur = lead.get("stage", "new")
    try:
        idx = STAGES.index(cur)
    except ValueError:
        idx = 0
    if idx >= len(STAGES) - 1:
        return lead
    next_stage = STAGES[idx + 1]
    await db.leads.update_one({"lead_id": lead_id}, {"$set": {"stage": next_stage, "updated_at": now_utc()}})
    await log_activity(current_user, "stage_change", f"Stage moved {cur} → {next_stage}", lead_id=lead_id)
    return await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})

# ============================================================
# SITE VISITS
# ============================================================
@api_router.post("/visits")
async def create_visit(payload: SiteVisitCreate, current_user: User = Depends(get_current_user)):
    lead = await db.leads.find_one({"lead_id": payload.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    assigned_name = None
    if payload.assigned_to:
        emp = await db.employees.find_one({"employee_id": payload.assigned_to}, {"_id": 0})
        if emp:
            assigned_name = emp["name"]
    visit = SiteVisit(
        visit_id=gen_id("vis"),
        lead_id=payload.lead_id,
        lead_name=lead["name"],
        scheduled_at=payload.scheduled_at,
        assigned_to=payload.assigned_to,
        assigned_name=assigned_name,
        created_at=now_utc(),
    )
    await db.visits.insert_one(visit.model_dump())
    # advance lead stage
    await db.leads.update_one({"lead_id": payload.lead_id}, {"$set": {"stage": "site_visit", "updated_at": now_utc()}})
    await log_activity(current_user, "visit", f"Site visit scheduled", lead_id=payload.lead_id,
                       meta={"scheduled_at": visit.scheduled_at.isoformat()})
    return visit.model_dump(mode="json")

@api_router.get("/visits")
async def list_visits(current_user: User = Depends(get_current_user)):
    visits = await db.visits.find({}, {"_id": 0}).sort("scheduled_at", -1).to_list(1000)
    return visits

@api_router.patch("/visits/{visit_id}")
async def update_visit(visit_id: str, payload: SiteVisitUpdate, current_user: User = Depends(get_current_user)):
    visit = await db.visits.find_one({"visit_id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        return visit
    await db.visits.update_one({"visit_id": visit_id}, {"$set": update_data})
    if update_data.get("status") == "completed":
        await log_activity(current_user, "visit", "Site visit completed", lead_id=visit["lead_id"])
    return await db.visits.find_one({"visit_id": visit_id}, {"_id": 0})

# ============================================================
# BOOKINGS
# ============================================================
@api_router.post("/bookings")
async def create_booking(payload: BookingCreate, current_user: User = Depends(get_current_user)):
    lead = await db.leads.find_one({"lead_id": payload.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    booking = Booking(
        booking_id=gen_id("bkg"),
        lead_id=payload.lead_id,
        lead_name=lead["name"],
        property_name=payload.property_name,
        booking_amount=payload.booking_amount,
        token_received=payload.token_received,
        payment_progress=int((payload.token_received / payload.booking_amount) * 100) if payload.booking_amount else 0,
        created_at=now_utc(),
    )
    await db.bookings.insert_one(booking.model_dump())
    await db.leads.update_one({"lead_id": payload.lead_id}, {"$set": {"stage": "booking", "updated_at": now_utc()}})
    await log_activity(current_user, "booking", f"Booking created for {payload.property_name}", lead_id=payload.lead_id,
                       meta={"amount": payload.booking_amount})
    return booking.model_dump(mode="json")

@api_router.get("/bookings")
async def list_bookings(current_user: User = Depends(get_current_user)):
    return await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.patch("/bookings/{booking_id}")
async def update_booking(booking_id: str, payload: BookingUpdate, current_user: User = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "token_received" in update_data and booking.get("booking_amount"):
        update_data["payment_progress"] = int((update_data["token_received"] / booking["booking_amount"]) * 100)
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": update_data})
    return await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})

# ============================================================
# LOANS
# ============================================================
@api_router.post("/loans")
async def create_loan(payload: LoanCreate, current_user: User = Depends(get_current_user)):
    lead = await db.leads.find_one({"lead_id": payload.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    loan = LoanApp(
        loan_id=gen_id("lon"),
        lead_id=payload.lead_id,
        lead_name=lead["name"],
        bank_name=payload.bank_name,
        amount=payload.amount,
        pending_documents=["PAN", "Aadhaar", "Income Proof", "Bank Statements"],
        created_at=now_utc(),
    )
    await db.loans.insert_one(loan.model_dump())
    await db.leads.update_one({"lead_id": payload.lead_id}, {"$set": {"stage": "loan", "updated_at": now_utc()}})
    await log_activity(current_user, "loan", f"Loan application initiated ({payload.bank_name or 'pending bank'})",
                       lead_id=payload.lead_id, meta={"amount": payload.amount})
    return loan.model_dump(mode="json")

@api_router.get("/loans")
async def list_loans(current_user: User = Depends(get_current_user)):
    return await db.loans.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.patch("/loans/{loan_id}")
async def update_loan(loan_id: str, payload: LoanUpdate, current_user: User = Depends(get_current_user)):
    loan = await db.loans.find_one({"loan_id": loan_id}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.loans.update_one({"loan_id": loan_id}, {"$set": update_data})
    if update_data.get("application_status") == "disbursed":
        await db.leads.update_one({"lead_id": loan["lead_id"]}, {"$set": {"stage": "registration", "updated_at": now_utc()}})
        await log_activity(current_user, "loan", "Loan disbursed - moving to registration", lead_id=loan["lead_id"])
    return await db.loans.find_one({"loan_id": loan_id}, {"_id": 0})

# ============================================================
# EMPLOYEES
# ============================================================
@api_router.post("/employees")
async def create_employee(payload: EmployeeCreate, current_user: User = Depends(get_current_user)):
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    emp = Employee(
        employee_id=gen_id("emp"),
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        role=payload.role,
        department=payload.department,
        created_at=now_utc(),
    )
    await db.employees.insert_one(emp.model_dump())
    return emp.model_dump(mode="json")

@api_router.get("/employees")
async def list_employees(current_user: User = Depends(get_current_user)):
    return await db.employees.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.patch("/employees/{employee_id}")
async def update_employee(employee_id: str, payload: EmployeeUpdate, current_user: User = Depends(get_current_user)):
    emp = await db.employees.find_one({"employee_id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.employees.update_one({"employee_id": employee_id}, {"$set": update_data})
    return await db.employees.find_one({"employee_id": employee_id}, {"_id": 0})

@api_router.delete("/employees/{employee_id}")
async def delete_employee(employee_id: str, current_user: User = Depends(get_current_user)):
    await db.employees.delete_one({"employee_id": employee_id})
    return {"ok": True}

# ============================================================
# CAMPAIGNS / TEMPLATES
# ============================================================
@api_router.post("/templates")
async def create_template(payload: TemplateCreate, current_user: User = Depends(get_current_user)):
    t = Template(template_id=gen_id("tpl"), name=payload.name, body=payload.body, created_at=now_utc())
    await db.templates.insert_one(t.model_dump())
    return t.model_dump(mode="json")

@api_router.get("/templates")
async def list_templates(current_user: User = Depends(get_current_user)):
    return await db.templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.delete("/templates/{template_id}")
async def delete_template(template_id: str, current_user: User = Depends(get_current_user)):
    await db.templates.delete_one({"template_id": template_id})
    return {"ok": True}

@api_router.post("/campaigns")
async def create_campaign(payload: CampaignCreate, current_user: User = Depends(get_current_user)):
    c = Campaign(
        campaign_id=gen_id("cmp"),
        name=payload.name,
        template_id=payload.template_id,
        audience=payload.audience,
        audience_filter=payload.audience_filter,
        scheduled_at=payload.scheduled_at,
        status="scheduled" if payload.scheduled_at else "draft",
        created_at=now_utc(),
    )
    await db.campaigns.insert_one(c.model_dump())
    return c.model_dump(mode="json")

@api_router.get("/campaigns")
async def list_campaigns(current_user: User = Depends(get_current_user)):
    return await db.campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.post("/campaigns/{campaign_id}/send")
async def send_campaign(campaign_id: str, current_user: User = Depends(get_current_user)):
    """Simulated send. Calculates audience size from leads."""
    c = await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    q: Dict[str, Any] = {}
    if c["audience"] == "positive":
        q["status"] = "active"
        q["stage"] = {"$in": ["positive", "site_visit", "booking", "loan", "registration"]}
    elif c["audience"] == "negative":
        q["status"] = "negative"
    elif c["audience"] == "by_stage" and c.get("audience_filter"):
        q["stage"] = c["audience_filter"]
    count = await db.leads.count_documents(q)
    delivered = int(count * 0.95)
    read = int(delivered * 0.7)
    replied = int(read * 0.2)
    await db.campaigns.update_one({"campaign_id": campaign_id}, {"$set": {
        "status": "sent",
        "sent_count": count,
        "delivered_count": delivered,
        "read_count": read,
        "replied_count": replied,
    }})
    return await db.campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0})

@api_router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, current_user: User = Depends(get_current_user)):
    await db.campaigns.delete_one({"campaign_id": campaign_id})
    return {"ok": True}

# ============================================================
# STATS / DASHBOARD
# ============================================================
@api_router.get("/stats/dashboard")
async def stats_dashboard(current_user: User = Depends(get_current_user)):
    total_leads = await db.leads.count_documents({})
    positive_leads = await db.leads.count_documents({"status": "active", "stage": {"$in": ["positive", "site_visit", "booking", "loan", "registration", "closed"]}})
    negative_leads = await db.leads.count_documents({"status": "negative"})
    new_leads = await db.leads.count_documents({"stage": "new"})
    site_visits = await db.visits.count_documents({})
    completed_visits = await db.visits.count_documents({"status": "completed"})
    bookings = await db.bookings.count_documents({})
    confirmed_bookings = await db.bookings.count_documents({"status": "confirmed"})
    loans = await db.loans.count_documents({})
    disbursed_loans = await db.loans.count_documents({"application_status": "disbursed"})
    employees = await db.employees.count_documents({})
    campaigns = await db.campaigns.count_documents({})

    revenue_pipeline = 0
    async for b in db.bookings.find({}, {"_id": 0, "booking_amount": 1}):
        revenue_pipeline += b.get("booking_amount", 0)

    # stage distribution
    stage_dist = {s: 0 for s in STAGES}
    async for l in db.leads.find({}, {"_id": 0, "stage": 1, "status": 1}):
        if l.get("status") == "negative":
            continue
        s = l.get("stage", "new")
        if s in stage_dist:
            stage_dist[s] += 1

    return {
        "total_leads": total_leads,
        "positive_leads": positive_leads,
        "negative_leads": negative_leads,
        "new_leads": new_leads,
        "site_visits": site_visits,
        "completed_visits": completed_visits,
        "bookings": bookings,
        "confirmed_bookings": confirmed_bookings,
        "loans": loans,
        "disbursed_loans": disbursed_loans,
        "employees": employees,
        "campaigns": campaigns,
        "revenue_pipeline": revenue_pipeline,
        "stage_distribution": stage_dist,
    }

@api_router.get("/stats/dashboard/graph")
async def stats_dashboard_graph(current_user: User = Depends(get_current_user)):
    """Return time‑series data for dashboard charts."""
    # Leads per day for last 30 days
    thirty_days_ago = now_utc() - timedelta(days=30)
    pipeline_leads = [
        {"$match": {"created_at": {"$gte": thirty_days_ago}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    leads_by_day = [
        {"date": doc["_id"], "count": doc["count"]}
        async for doc in db.leads.aggregate(pipeline_leads)
    ]

    # Revenue per month for last 12 months
    twelve_months_ago = now_utc() - timedelta(days=365)
    pipeline_rev = [
        {"$match": {"created_at": {"$gte": twelve_months_ago}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m", "date": "$created_at"}}, "revenue": {"$sum": "$booking_amount"}}},
        {"$sort": {"_id": 1}},
    ]
    revenue_by_month = [
        {"month": doc["_id"], "revenue": doc["revenue"]}
        async for doc in db.bookings.aggregate(pipeline_rev)
    ]

    return {"leads_by_day": leads_by_day, "revenue_by_month": revenue_by_month}


@api_router.get("/activities")
async def list_activities(limit: int = 50, current_user: User = Depends(get_current_user)):
    return await db.activities.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)

@api_router.get("/stats/me")
async def stats_me(current_user: User = Depends(get_current_user)):
    """Personal performance for the logged-in user (treating them as an employee)."""
    eid = current_user.acting_as_employee_id
    emp = None
    if eid:
        emp = await db.employees.find_one({"employee_id": eid}, {"_id": 0})

    # Hot/Warm/Cold lead counts (visible to everyone)
    hot = await db.leads.count_documents({"status": "active", "stage": {"$in": ["positive", "site_visit", "booking", "loan", "registration"]}})
    warm = await db.leads.count_documents({"status": "active", "stage": "contacted"})
    cold = await db.leads.count_documents({"status": "active", "stage": "new"})
    negative = await db.leads.count_documents({"status": "negative"})
    closed = await db.leads.count_documents({"stage": "closed"})

    personal = {
        "actions_total": 0, "positives": 0, "negatives": 0, "followups": 0,
        "visits": 0, "bookings_done": 0, "loans_done": 0, "closed_deals": 0,
        "call_notes": 0, "score_10": 0, "last_activity": None,
    }
    if eid:
        total = await db.activities.count_documents({"employee_id": eid})
        positives = await db.activities.count_documents({"employee_id": eid, "text": {"$regex": "positive", "$options": "i"}})
        negatives = await db.activities.count_documents({"employee_id": eid, "text": {"$regex": "negative", "$options": "i"}})
        followups = await db.activities.count_documents({"employee_id": eid, "text": {"$regex": "contacted", "$options": "i"}})
        visits = await db.activities.count_documents({"employee_id": eid, "type": "visit"})
        bookings_done = await db.activities.count_documents({"employee_id": eid, "type": "booking"})
        loans_done = await db.activities.count_documents({"employee_id": eid, "type": "loan"})
        closed_deals = await db.activities.count_documents({"employee_id": eid, "text": {"$regex": "→ closed", "$options": "i"}})
        notes = await db.activities.count_documents({"employee_id": eid, "type": "call_note"})
        last = await db.activities.find({"employee_id": eid}, {"_id": 0}).sort("created_at", -1).limit(1).to_list(1)
        last_at = last[0]["created_at"] if last else None

        # Calculate score /10 based on role
        role = emp.get("role") if emp else current_user.role
        score = 0.0
        if role == "telecaller":
            # 2 points per positive, 0.5 per contacted, 1 per note; cap at 10
            score = min(10.0, positives * 2 + followups * 0.5 + notes * 1)
        elif role == "site_visit":
            score = min(10.0, visits * 1.5)
        elif role == "booking":
            score = min(10.0, bookings_done * 2.5)
        elif role == "loan":
            score = min(10.0, loans_done * 1.5 + closed_deals * 3)
        elif role == "marketing":
            campaigns = await db.campaigns.count_documents({})
            sent = await db.campaigns.count_documents({"status": "sent"})
            score = min(10.0, sent * 2 + campaigns * 0.5)
        else:
            score = min(10.0, total * 0.5)

        personal = {
            "actions_total": total, "positives": positives, "negatives": negatives,
            "followups": followups, "visits": visits, "bookings_done": bookings_done,
            "loans_done": loans_done, "closed_deals": closed_deals,
            "call_notes": notes, "score_10": round(score, 1),
            "last_activity": last_at,
        }

    return {
        "employee": emp,
        "role": (emp.get("role") if emp else current_user.role),
        "personal": personal,
        "leads": {
            "hot": hot, "warm": warm, "cold": cold,
            "negative": negative, "closed": closed,
        },
    }

@api_router.get("/stats/employees")
async def stats_employees(current_user: User = Depends(get_current_user)):
    """Per-employee performance dashboard."""
    employees = await db.employees.find({}, {"_id": 0}).to_list(1000)
    result = []
    for e in employees:
        eid = e["employee_id"]
        # Total actions
        total = await db.activities.count_documents({"employee_id": eid})
        # Last activity
        last = await db.activities.find({"employee_id": eid}, {"_id": 0}).sort("created_at", -1).limit(1).to_list(1)
        last_at = last[0]["created_at"] if last else None
        # Type-based counts
        positives = await db.activities.count_documents({"employee_id": eid, "text": {"$regex": "positive", "$options": "i"}})
        negatives = await db.activities.count_documents({"employee_id": eid, "text": {"$regex": "negative", "$options": "i"}})
        followups = await db.activities.count_documents({"employee_id": eid, "text": {"$regex": "contacted", "$options": "i"}})
        visits = await db.activities.count_documents({"employee_id": eid, "type": "visit"})
        bookings_done = await db.activities.count_documents({"employee_id": eid, "type": "booking"})
        loans_done = await db.activities.count_documents({"employee_id": eid, "type": "loan"})
        closed = await db.activities.count_documents({"employee_id": eid, "text": {"$regex": "→ closed", "$options": "i"}})
        notes = await db.activities.count_documents({"employee_id": eid, "type": "call_note"})

        result.append({
            **e,
            "actions_total": total,
            "last_activity": last_at,
            "positives": positives,
            "negatives": negatives,
            "followups": followups,
            "visits": visits,
            "bookings_done": bookings_done,
            "loans_done": loans_done,
            "closed_deals": closed,
            "call_notes": notes,
        })
    # sort by actions descending
    result.sort(key=lambda x: x["actions_total"], reverse=True)
    return result

# ============================================================
# HEALTH
# ============================================================
@api_router.get("/")
async def root():
    return {"app": "Umang Properties CRM", "status": "ok"}

# ============================================================
# WIRING
# ============================================================
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
