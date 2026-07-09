"""Umang Hometech LLP CRM API — thin entrypoint (Phase 2 modular layout).

Implementation lives in app.legacy_core; this module is an alias so tests and
deploy entrypoints (`app.main:app`) keep working without behavior changes.
Monkeypatching `main.sb_select` etc. still affects route handlers.
"""
import sys

import app.legacy_core as _impl

sys.modules[__name__] = _impl
