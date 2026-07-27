"""In-memory caches and canonical Supabase select strings."""
import os
import threading
from typing import Any, Dict

LEADS_CACHE_TTL_SEC = int(os.environ.get("LEADS_CACHE_TTL_SEC", "60"))
_USER_CACHE_TTL_SEC = int(os.environ.get("USER_CACHE_TTL_SEC", "300"))
_USER_PROFILE_CACHE_MAX = int(os.environ.get("USER_PROFILE_CACHE_MAX", "150"))
_SESSION_CACHE_MAX_ITEMS = int(os.environ.get("SESSION_CACHE_MAX_ITEMS", "400"))
_STATS_CACHE_TTL_SEC = int(os.environ.get("STATS_CACHE_TTL_SEC", "60"))

_leads_cache: Dict[str, Any] = {"ts": 0.0, "select": "", "data": []}
_user_profile_cache: Dict[str, Dict[str, Any]] = {}
_employees_cache: Dict[str, Any] = {"ts": 0.0, "data": []}
_EMPLOYEES_CACHE_TTL = 120
_assignment_stats_cache: Dict[str, Any] = {"ts": 0.0, "data": None}
_employee_stats_cache: Dict[str, Any] = {"ts": 0.0, "data": None}
_dashboard_stats_cache: Dict[str, Any] = {"ts": 0.0, "data": None}
_graph_cache: Dict[str, Any] = {"ts": 0.0, "data": None}
_leads_cache_lock = threading.Lock()
_leads_cache_loading = threading.Event()

LEADS_CANONICAL_SELECT = (
    "lead_id,name,phone,email,external_lead_id,source,stage,status,lead_type,"
    "priority,call_status,budget,location,property_type,assigned_to,assigned_at,last_employee_action_at,"
    "site_visitor_id,site_visit_assigned_by,site_visit_assigned_at,"
    "follow_up_at,created_at,updated_at,starred,brokerage_amount"
)

# Dashboard metric boxes + /leads/filtered drill-down MUST use the same lead shape.
# Narrow selects break is_missed_lead (needs assigned_at/updated_at/last_employee_action_at)
# and classify_employee_performance_metric (ringing/follow_up), so counts diverge from lists.
DASHBOARD_BUCKET_LEAD_SELECT = LEADS_CANONICAL_SELECT

EMPLOYEE_WORKFLOW_LEAD_SELECT = (
    "lead_id,name,phone,email,source,assigned_to,status,stage,priority,call_status,"
    "follow_up_at,assigned_at,last_employee_action_at,created_at,updated_at,lead_type,"
    "site_visitor_id,site_visit_assigned_by,site_visit_assigned_at,"
    "budget,location,property_type,raw_payload"
)

__all__ = [
    "LEADS_CACHE_TTL_SEC",
    "_USER_CACHE_TTL_SEC",
    "_USER_PROFILE_CACHE_MAX",
    "_SESSION_CACHE_MAX_ITEMS",
    "_STATS_CACHE_TTL_SEC",
    "_leads_cache",
    "_user_profile_cache",
    "_employees_cache",
    "_EMPLOYEES_CACHE_TTL",
    "_assignment_stats_cache",
    "_employee_stats_cache",
    "_dashboard_stats_cache",
    "_graph_cache",
    "_leads_cache_lock",
    "_leads_cache_loading",
    "LEADS_CANONICAL_SELECT",
    "DASHBOARD_BUCKET_LEAD_SELECT",
    "EMPLOYEE_WORKFLOW_LEAD_SELECT",
]
