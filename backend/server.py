"""Umang Properties – Real Estate CRM Backend (In-Memory Demo)"""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
import uuid, logging, random
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

app = FastAPI(title="Umang Properties CRM")
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

# ---- In-Memory Store ----
DB = {"users":{},"sessions":{},"leads":{},"activities":{},"visits":{},"bookings":{},"loans":{},"employees":{},"templates":{},"campaigns":{}}

def _seed():
    uid = "user_admin001"
    DB["users"][uid] = {"user_id":uid,"email":"umang@admin","name":"Umang Admin","picture":None,"role":"admin","acting_as_employee_id":None,"created_at":now_utc()}
    names = ["Rahul Sharma","Priya Patel","Amit Singh","Sneha Gupta","Vikram Joshi","Neha Reddy","Arjun Kumar","Kavita Nair"]
    stages = ["new","contacted","positive","site_visit","booking","loan","registration","closed"]
    for i,n in enumerate(names):
        lid = gen_id("lead")
        st = stages[i % len(stages)]
        DB["leads"][lid] = {"lead_id":lid,"name":n,"phone":f"98765{10000+i}","email":f"{n.split()[0].lower()}@mail.com",
            "budget":f"{random.randint(30,200)} Lacs","location":random.choice(["Baner","Wakad","Hinjewadi","Kothrud"]),
            "property_type":random.choice(["2BHK","3BHK","Villa","Plot"]),"notes":"Demo lead","source":"website",
            "stage":st,"status":"active","assigned_to":None,"created_at":now_utc()-timedelta(days=random.randint(1,30)),
            "updated_at":now_utc()}
    for dept,role in [("Sales","telecaller"),("Field","site_visit"),("Operations","booking"),("Finance","loan")]:
        eid = gen_id("emp")
        DB["employees"][eid] = {"employee_id":eid,"name":f"Demo {dept}","email":f"{dept.lower()}@umang.com",
            "phone":"9876500000","role":role,"department":dept,"active":True,"leads_assigned":0,"leads_closed":0,
            "last_login":None,"created_at":now_utc()}
_seed()

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
    sess = DB["sessions"].get(token)
    if not sess: raise HTTPException(401, "Invalid session")
    if sess["expires_at"] <= now_utc(): raise HTTPException(401, "Session expired")
    u = DB["users"].get(sess["user_id"])
    if not u: raise HTTPException(401, "User not found")
    return User(**u)

# ---- Auth Endpoints ----
@api_router.post("/auth/session")
async def auth_session(request: Request, response: Response):
    body = await request.json()
    email, password = body.get("email"), body.get("password")
    if email == "umang@admin" and password == "umang@admin":
        uid = "user_admin001"
    else:
        raise HTTPException(401, "Invalid credentials")
    token = gen_id("sess")
    DB["sessions"][token] = {"session_token":token,"user_id":uid,"created_at":now_utc(),"expires_at":now_utc()+timedelta(days=7)}
    response.set_cookie(key="session_token",value=token,max_age=604800,httponly=True,samesite="none",path="/")
    u = DB["users"][uid]
    return {"user":User(**u).model_dump(mode="json"),"session_token":token}

@api_router.get("/auth/me")
async def auth_me(cu: User = Depends(get_current_user)):
    return cu.model_dump(mode="json")

@api_router.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    t = await get_session_token(request)
    if t: DB["sessions"].pop(t, None)
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

@api_router.post("/auth/set-role")
async def auth_set_role(payload: RoleSet, cu: User = Depends(get_current_user)):
    if payload.role not in ROLES: raise HTTPException(400, "Invalid role")
    DB["users"][cu.user_id]["role"] = payload.role
    return User(**DB["users"][cu.user_id]).model_dump(mode="json")

@api_router.post("/auth/act-as")
async def auth_act_as(payload: ActAs, cu: User = Depends(get_current_user)):
    DB["users"][cu.user_id]["acting_as_employee_id"] = payload.employee_id
    return User(**DB["users"][cu.user_id]).model_dump(mode="json")

# ---- Activity Logger ----
def log_activity(actor, type_, text, lead_id=None, meta=None):
    e = {"entry_id":gen_id("act"),"lead_id":lead_id,"actor_id":actor.user_id if actor else None,
         "actor_name":actor.name if actor else "System","actor_role":actor.role if actor else "system",
         "employee_id":None,"employee_name":None,"type":type_,"text":text,"meta":meta or {},"created_at":now_utc()}
    DB["activities"][e["entry_id"]] = e
    return e

# ---- Leads ----
@api_router.post("/leads/public")
async def create_lead_public(p: LeadCreatePublic):
    lid = gen_id("lead")
    lead = {"lead_id":lid,"name":p.name,"phone":p.phone,"email":p.email,"budget":p.budget,"location":p.location,
        "property_type":p.property_type,"notes":p.notes,"source":"website","stage":"new","status":"active",
        "assigned_to":None,"created_at":now_utc(),"updated_at":now_utc()}
    DB["leads"][lid] = lead
    return lead

@api_router.get("/leads")
async def list_leads(stage:Optional[str]=None,status_:Optional[str]=None,assigned_to:Optional[str]=None,cu:User=Depends(get_current_user)):
    out = list(DB["leads"].values())
    if stage: out = [l for l in out if l.get("stage")==stage]
    if status_: out = [l for l in out if l.get("status")==status_]
    if assigned_to: out = [l for l in out if l.get("assigned_to")==assigned_to]
    out.sort(key=lambda x: x.get("created_at",now_utc()), reverse=True)
    return out

@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id:str, cu:User=Depends(get_current_user)):
    lead = DB["leads"].get(lead_id)
    if not lead: raise HTTPException(404,"Lead not found")
    timeline = sorted([a for a in DB["activities"].values() if a.get("lead_id")==lead_id], key=lambda x:x["created_at"], reverse=True)
    return {"lead":lead,"timeline":timeline}

@api_router.patch("/leads/{lead_id}")
async def update_lead(lead_id:str, p:LeadUpdate, cu:User=Depends(get_current_user)):
    lead = DB["leads"].get(lead_id)
    if not lead: raise HTTPException(404,"Lead not found")
    for k,v in p.model_dump().items():
        if v is not None: lead[k] = v
    lead["updated_at"] = now_utc()
    return lead

@api_router.post("/leads/{lead_id}/notes")
async def add_lead_note(lead_id:str, p:NoteCreate, cu:User=Depends(get_current_user)):
    if lead_id not in DB["leads"]: raise HTTPException(404,"Lead not found")
    return log_activity(cu, p.type, p.text, lead_id=lead_id)

@api_router.post("/leads/{lead_id}/advance")
async def advance_lead(lead_id:str, cu:User=Depends(get_current_user)):
    lead = DB["leads"].get(lead_id)
    if not lead: raise HTTPException(404,"Lead not found")
    cur = lead.get("stage","new")
    try: idx = STAGES.index(cur)
    except: idx = 0
    if idx >= len(STAGES)-1: return lead
    lead["stage"] = STAGES[idx+1]; lead["updated_at"] = now_utc()
    log_activity(cu,"stage_change",f"Stage moved {cur} → {lead['stage']}",lead_id=lead_id)
    return lead

# ---- Visits ----
@api_router.post("/visits")
async def create_visit(p:SiteVisitCreate, cu:User=Depends(get_current_user)):
    lead = DB["leads"].get(p.lead_id)
    if not lead: raise HTTPException(404,"Lead not found")
    vid = gen_id("vis")
    v = {"visit_id":vid,"lead_id":p.lead_id,"lead_name":lead["name"],"scheduled_at":p.scheduled_at.isoformat(),
         "assigned_to":p.assigned_to,"assigned_name":None,"status":"scheduled","feedback":None,"interested":None,"created_at":now_utc().isoformat()}
    DB["visits"][vid] = v; return v

@api_router.get("/visits")
async def list_visits(cu:User=Depends(get_current_user)):
    return sorted(DB["visits"].values(), key=lambda x:str(x.get("scheduled_at","")), reverse=True)

@api_router.patch("/visits/{visit_id}")
async def update_visit(visit_id:str, p:SiteVisitUpdate, cu:User=Depends(get_current_user)):
    v = DB["visits"].get(visit_id)
    if not v: raise HTTPException(404,"Visit not found")
    for k,val in p.model_dump().items():
        if val is not None: v[k]=val
    return v

# ---- Bookings ----
@api_router.post("/bookings")
async def create_booking(p:BookingCreate, cu:User=Depends(get_current_user)):
    lead = DB["leads"].get(p.lead_id)
    if not lead: raise HTTPException(404,"Lead not found")
    bid = gen_id("bkg")
    b = {"booking_id":bid,"lead_id":p.lead_id,"lead_name":lead["name"],"property_name":p.property_name,
         "booking_amount":p.booking_amount,"token_received":p.token_received,"agreement_status":"pending",
         "payment_progress":int((p.token_received/p.booking_amount)*100) if p.booking_amount else 0,
         "status":"active","created_at":now_utc().isoformat()}
    DB["bookings"][bid] = b; return b

@api_router.get("/bookings")
async def list_bookings(cu:User=Depends(get_current_user)):
    return list(DB["bookings"].values())

@api_router.patch("/bookings/{booking_id}")
async def update_booking(booking_id:str, p:BookingUpdate, cu:User=Depends(get_current_user)):
    b = DB["bookings"].get(booking_id)
    if not b: raise HTTPException(404,"Booking not found")
    for k,v in p.model_dump().items():
        if v is not None: b[k]=v
    return b

# ---- Loans ----
@api_router.post("/loans")
async def create_loan(p:LoanCreate, cu:User=Depends(get_current_user)):
    lead = DB["leads"].get(p.lead_id)
    if not lead: raise HTTPException(404,"Lead not found")
    lid = gen_id("lon")
    l = {"loan_id":lid,"lead_id":p.lead_id,"lead_name":lead["name"],"bank_name":p.bank_name,"amount":p.amount,
         "application_status":"pending","bank_stage":"documentation","pending_documents":["PAN","Aadhaar","Income Proof"],
         "emi_eligible":None,"progress":0,"created_at":now_utc().isoformat()}
    DB["loans"][lid] = l; return l

@api_router.get("/loans")
async def list_loans(cu:User=Depends(get_current_user)):
    return list(DB["loans"].values())

@api_router.patch("/loans/{loan_id}")
async def update_loan(loan_id:str, p:LoanUpdate, cu:User=Depends(get_current_user)):
    l = DB["loans"].get(loan_id)
    if not l: raise HTTPException(404,"Loan not found")
    for k,v in p.model_dump().items():
        if v is not None: l[k]=v
    return l

# ---- Employees ----
@api_router.post("/employees")
async def create_employee(p:EmployeeCreate, cu:User=Depends(get_current_user)):
    eid = gen_id("emp")
    e = {"employee_id":eid,"name":p.name,"email":p.email,"phone":p.phone,"role":p.role,"department":p.department,
         "active":True,"leads_assigned":0,"leads_closed":0,"last_login":None,"created_at":now_utc().isoformat()}
    DB["employees"][eid] = e; return e

@api_router.get("/employees")
async def list_employees(cu:User=Depends(get_current_user)):
    return list(DB["employees"].values())

@api_router.patch("/employees/{eid}")
async def update_employee(eid:str, p:EmployeeUpdate, cu:User=Depends(get_current_user)):
    e = DB["employees"].get(eid)
    if not e: raise HTTPException(404,"Employee not found")
    for k,v in p.model_dump().items():
        if v is not None: e[k]=v
    return e

@api_router.delete("/employees/{eid}")
async def delete_employee(eid:str, cu:User=Depends(get_current_user)):
    DB["employees"].pop(eid,None); return {"ok":True}

# ---- Templates & Campaigns ----
@api_router.post("/templates")
async def create_template(p:TemplateCreate, cu:User=Depends(get_current_user)):
    tid = gen_id("tpl")
    t = {"template_id":tid,"name":p.name,"body":p.body,"created_at":now_utc().isoformat()}
    DB["templates"][tid]=t; return t

@api_router.get("/templates")
async def list_templates(cu:User=Depends(get_current_user)):
    return list(DB["templates"].values())

@api_router.delete("/templates/{tid}")
async def delete_template(tid:str, cu:User=Depends(get_current_user)):
    DB["templates"].pop(tid,None); return {"ok":True}

@api_router.post("/campaigns")
async def create_campaign(p:CampaignCreate, cu:User=Depends(get_current_user)):
    cid = gen_id("cmp")
    c = {"campaign_id":cid,"name":p.name,"template_id":p.template_id,"audience":p.audience,
         "scheduled_at":p.scheduled_at.isoformat() if p.scheduled_at else None,
         "status":"draft","sent_count":0,"delivered_count":0,"read_count":0,"replied_count":0,"created_at":now_utc().isoformat()}
    DB["campaigns"][cid]=c; return c

@api_router.get("/campaigns")
async def list_campaigns(cu:User=Depends(get_current_user)):
    return list(DB["campaigns"].values())

@api_router.post("/campaigns/{cid}/send")
async def send_campaign(cid:str, cu:User=Depends(get_current_user)):
    c = DB["campaigns"].get(cid)
    if not c: raise HTTPException(404,"Campaign not found")
    cnt = len(DB["leads"]); c.update({"status":"sent","sent_count":cnt,"delivered_count":int(cnt*.95),"read_count":int(cnt*.7),"replied_count":int(cnt*.2)})
    return c

@api_router.delete("/campaigns/{cid}")
async def delete_campaign(cid:str, cu:User=Depends(get_current_user)):
    DB["campaigns"].pop(cid,None); return {"ok":True}

# ---- Stats / Dashboard ----
@api_router.get("/stats/dashboard")
async def stats_dashboard(cu:User=Depends(get_current_user)):
    leads = list(DB["leads"].values())
    stage_dist = {s:0 for s in STAGES}
    for l in leads:
        if l.get("status")!="negative": stage_dist[l.get("stage","new")] = stage_dist.get(l.get("stage","new"),0)+1
    rev = sum(b.get("booking_amount",0) for b in DB["bookings"].values())
    return {"total_leads":len(leads),"positive_leads":sum(1 for l in leads if l.get("stage") in ["positive","site_visit","booking","loan","registration","closed"]),
        "negative_leads":sum(1 for l in leads if l.get("status")=="negative"),"new_leads":sum(1 for l in leads if l.get("stage")=="new"),
        "site_visits":len(DB["visits"]),"completed_visits":sum(1 for v in DB["visits"].values() if v.get("status")=="completed"),
        "bookings":len(DB["bookings"]),"confirmed_bookings":sum(1 for b in DB["bookings"].values() if b.get("status")=="confirmed"),
        "loans":len(DB["loans"]),"disbursed_loans":sum(1 for l in DB["loans"].values() if l.get("application_status")=="disbursed"),
        "employees":len(DB["employees"]),"campaigns":len(DB["campaigns"]),"revenue_pipeline":rev,"stage_distribution":stage_dist}

@api_router.get("/stats/dashboard/graph")
async def stats_dashboard_graph(cu:User=Depends(get_current_user)):
    leads_by_day = []
    for i in range(30):
        d = (now_utc()-timedelta(days=29-i)).strftime("%Y-%m-%d")
        leads_by_day.append({"date":d,"count":random.randint(0,5)})
    rev_by_month = []
    for i in range(12):
        d = (now_utc()-timedelta(days=(11-i)*30)).strftime("%Y-%m")
        rev_by_month.append({"month":d,"revenue":random.randint(50,500)*10000})
    return {"leads_by_day":leads_by_day,"revenue_by_month":rev_by_month}

@api_router.get("/activities")
async def list_activities(limit:int=50, cu:User=Depends(get_current_user)):
    acts = sorted(DB["activities"].values(), key=lambda x:x.get("created_at",now_utc()), reverse=True)
    return acts[:limit]

@api_router.get("/stats/me")
async def stats_me(cu:User=Depends(get_current_user)):
    return {"employee":None,"role":cu.role,"personal":{"actions_total":0,"positives":0,"negatives":0,"followups":0,
        "visits":0,"bookings_done":0,"loans_done":0,"closed_deals":0,"call_notes":0,"score_10":0,"last_activity":None},
        "leads":{"hot":3,"warm":2,"cold":1,"negative":0,"closed":1}}

@api_router.get("/stats/employees")
async def stats_employees(cu:User=Depends(get_current_user)):
    return [{"employee_id":e["employee_id"],"name":e["name"],"email":e["email"],"role":e["role"],"department":e.get("department",""),
        "actions_total":random.randint(5,50),"last_activity":now_utc().isoformat(),"positives":random.randint(1,10),
        "negatives":random.randint(0,3),"followups":random.randint(2,15),"visits":random.randint(0,8),
        "bookings_done":random.randint(0,5),"loans_done":random.randint(0,3),"closed_deals":random.randint(0,2),"call_notes":random.randint(3,20)}
        for e in DB["employees"].values()]

# ---- Health & Wiring ----
@api_router.get("/")
async def root(): return {"app":"Umang Properties CRM","status":"ok"}

app.include_router(api_router)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
