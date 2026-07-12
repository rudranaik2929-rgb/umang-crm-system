import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def test_compute_assignment_only_patch_respects_stage():
  new_lead = {"lead_id": "l1", "stage": "new", "status": "active"}
  patch_new = main.compute_assignment_only_patch(new_lead, "emp1", "mgr1")
  assert patch_new["stage"] == "assigned"
  assert patch_new["assigned_to"] == "emp1"

  visited = {"lead_id": "l2", "stage": "site_visit", "status": "active"}
  patch_visited = main.compute_assignment_only_patch(visited, "emp1", "mgr1")
  assert "stage" not in patch_visited or patch_visited.get("stage") != "assigned"


def test_compute_assignment_reactivates_negative():
  neg = {"lead_id": "l3", "stage": "assigned", "status": "negative"}
  patch = main.compute_assignment_only_patch(neg, "emp2", "mgr1", reactivate=True)
  assert patch["status"] == "active"


def test_bulk_unassign_clears_assignment_fields():
  body = main.BulkLeadManageRequest(lead_ids=["l1"], unassign=True)
  old = {"lead_id": "l1", "stage": "assigned", "status": "active", "assigned_to": "emp1"}
  patch = main.compute_bulk_manage_patch(old, body, {}, None, "mgr1")
  assert patch.get("assigned_to") is None
  assert patch.get("assigned_at") is None
  assert patch.get("assigned_by") is None


def test_bulk_manage_patch_merges_assign_and_inquiry():
  body = main.BulkLeadManageRequest(
    lead_ids=["l1"],
    assigned_to="emp1",
    inquiry_action="ringing",
    reactivate=True,
  )
  preset = main.INQUIRY_ACTION_PRESETS["ringing"]
  old = {"lead_id": "l1", "stage": "new", "status": "active"}
  patch = main.compute_bulk_manage_patch(old, body, preset, "emp1", "mgr1")
  assert patch["assigned_to"] == "emp1"
  assert patch.get("call_status") == "ringing"


def test_patch_fingerprint_groups_identical_patches():
  p1 = {"assigned_to": "e1", "stage": "assigned", "updated_at": "t1"}
  p2 = {"assigned_to": "e1", "stage": "assigned", "updated_at": "t2"}
  assert main._patch_fingerprint(p1) != main._patch_fingerprint(p2)
  p3 = {"assigned_to": "e1", "stage": "assigned", "updated_at": "t1"}
  assert main._patch_fingerprint(p1) == main._patch_fingerprint(p3)
