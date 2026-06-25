import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


def test_strip_activity_actor_prefix():
    assert main.strip_activity_actor_prefix("[Ravi] Hello") == "Hello"
    assert main.strip_activity_actor_prefix("Hello") == "Hello"


def test_format_activity_note_text_strips_existing_prefix():
    class Actor:
        name = "Ravi"
        acting_as_employee_id = None

    body = main.format_activity_note_text(Actor(), "[Ravi] Customer callback tomorrow")
    assert body == "[Ravi] Customer callback tomorrow"
