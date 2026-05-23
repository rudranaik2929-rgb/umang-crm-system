"""Compatibility entry point for existing deploy commands.

The active FastAPI application now lives in ``backend/app/main.py``.
Keep this file so commands such as ``uvicorn server:app`` and
``uvicorn backend.server:app`` continue to work without changing logic.
"""
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import *  # noqa: F401,F403
