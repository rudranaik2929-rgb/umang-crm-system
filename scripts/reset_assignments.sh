#!/usr/bin/env bash
# Reset all lead assignments + follow-ups (keeps lead records).
# Usage: ADMIN_TOKEN=your_jwt ./scripts/reset_assignments.sh
# Or:   ./scripts/reset_assignments.sh https://your-api.onrender.com your_jwt_token

set -euo pipefail

API_URL="${1:-${EXPO_PUBLIC_BACKEND_URL:-https://umang-crm-systemumang-home-tech.onrender.com}}"
TOKEN="${2:-${ADMIN_TOKEN:-}}"

if [[ -z "$TOKEN" ]]; then
  echo "Error: set ADMIN_TOKEN or pass API URL + JWT as arguments."
  echo "Example: ADMIN_TOKEN=eyJ... ./scripts/reset_assignments.sh"
  exit 1
fi

curl -sS -X POST "${API_URL%/}/api/leads/reset-assignments" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool

echo ""
echo "Done. Refresh the CRM in your browser."
