/** Housing.com / CRM lead display helpers — dates, budget (lakhs), BHK config. */

export const CALL_STATUS_OPTIONS = [
  { key: 'ringing', label: 'Ringing' },
  { key: 'out_of_service', label: 'Out of Service' },
  { key: 'call_back', label: 'Call Back' },
  { key: 'disconnect', label: 'Disconnect' },
] as const;

export type CallStatusKey = typeof CALL_STATUS_OPTIONS[number]['key'];

export function callStatusLabel(key?: string | null): string {
  if (!key) return '';
  return CALL_STATUS_OPTIONS.find((o) => o.key === key)?.label || key.replace(/_/g, ' ');
}

const NEGATIVE_PRIORITY_LABELS: Record<string, string> = {
  low_budget: 'Low Budget',
  other_location: 'Other Location',
  already_purchased: 'Already Purchased',
};

const WORKFLOW_STATUS_COLORS: Record<string, string> = {
  ringing: '#F59E0B',
  not_interested: '#E11D48',
  low_budget: '#E11D48',
  hot: '#E11D48',
  visited: '#0EA5E9',
  booking_done: '#059669',
  booked: '#059669',
  follow_up: '#F97316',
  new: '#0284C7',
  assigned: '#8B5CF6',
  active: '#6366F1',
  closed: '#10B981',
};

function leadPriority(lead: any): string {
  return String(lead?.priority || '').trim().toLowerCase();
}

/** Matches backend workflow_status_label / performance box buckets. */
export function workflowStatusLabel(lead: any): string {
  if (lead?.workflow_status_label) return lead.workflow_status_label;
  if (lead?.status === 'negative') {
    return NEGATIVE_PRIORITY_LABELS[leadPriority(lead)] || 'Not Interested';
  }
  if (leadPriority(lead) === 'low_budget') return 'Low Budget';
  const cs = String(lead?.call_status || '').trim();
  if (cs) return callStatusLabel(cs);
  const stage = lead?.stage;
  const pr = leadPriority(lead);
  if (['booking', 'loan', 'registration'].includes(stage) || ['handoff_booking', 'handoff_loan'].includes(pr)) {
    return 'Booking Done';
  }
  if (['site_visit', 'positive'].includes(stage)) return 'Visited';
  if (pr === 'hot') return 'Hot';
  if (lead?.follow_up_at && lead?.status !== 'negative') return 'Follow Up';
  if (stage === 'closed') return 'Closed';
  if (stage === 'new') return 'New Lead';
  if (stage === 'assigned') return 'Assigned';
  if (!lead?.assigned_to && ['new', 'assigned'].includes(stage)) return 'New Lead';
  return 'Active';
}

export function workflowStatusColor(lead: any): string {
  const label = workflowStatusLabel(lead);
  if (lead?.call_status) return WORKFLOW_STATUS_COLORS.ringing;
  if (label === 'Not Interested' || label in NEGATIVE_PRIORITY_LABELS) return WORKFLOW_STATUS_COLORS.not_interested;
  if (label === 'Low Budget') return WORKFLOW_STATUS_COLORS.low_budget;
  if (label === 'Hot') return WORKFLOW_STATUS_COLORS.hot;
  if (label === 'Visited') return WORKFLOW_STATUS_COLORS.visited;
  if (label === 'Booking Done') return WORKFLOW_STATUS_COLORS.booking_done;
  if (label === 'Follow Up') return WORKFLOW_STATUS_COLORS.follow_up;
  if (label === 'New Lead') return WORKFLOW_STATUS_COLORS.new;
  if (label === 'Assigned') return WORKFLOW_STATUS_COLORS.assigned;
  if (label === 'Closed') return WORKFLOW_STATUS_COLORS.closed;
  return WORKFLOW_STATUS_COLORS.active;
}

/** Convert rupees or lakh-scale numbers to a short lakh label (e.g. 45). */
export function toLakhShort(val: unknown): string | null {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return null;
  let lakhs: number;
  if (n >= 100000) lakhs = n / 100000;
  else if (n >= 1000) lakhs = n / 100000;
  else lakhs = n;
  const rounded = Math.round(lakhs * 10) / 10;
  return Number.isInteger(rounded) ? String(Math.round(rounded)) : String(rounded);
}

/** Budget range as "45 - 50" (lakhs), not full rupee amounts. */
export function formatBudgetRangeLakhs(min?: unknown, max?: unknown, fallback?: string | null): string | null {
  const a = toLakhShort(min);
  const b = toLakhShort(max);
  if (a && b) return `${a} - ${b}`;
  if (a) return a;
  if (b) return b;
  if (fallback) return formatBudgetStringLakhs(fallback);
  return null;
}

/** Parse stored budget strings like "4500000 - 5000000" into "45 - 50". */
export function formatBudgetStringLakhs(raw?: string | null): string | null {
  if (!raw) return null;
  const parts = String(raw).split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const a = toLakhShort(parts[0]);
    const b = toLakhShort(parts[1]);
    if (a && b) return `${a} - ${b}`;
  }
  return toLakhShort(parts[0]) || raw;
}

/** Housing lead_date is often Unix seconds/ms — show real date-time. */
export function formatHousingLeadDate(value: unknown, fallbackIso?: string | null): string {
  if (value != null && String(value).trim() !== '') {
    const raw = String(value).trim();
    if (/^\d+$/.test(raw)) {
      let ts = parseInt(raw, 10);
      if (ts > 1e12) ts = Math.floor(ts / 1000);
      const d = new Date(ts * 1000);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        });
      }
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
    }
  }
  if (fallbackIso) {
    const d = new Date(fallbackIso);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
    }
  }
  return '—';
}

/** Prefer 1 BHK / 2 BHK / 3 BHK over generic "Apartment". */
export function formatHousingConfiguration(raw: Record<string, unknown>): string | null {
  const candidates = [
    raw.configuration, raw.config, raw.bhk, raw.requirement,
    raw.unit_type, raw.property_type, raw.property_field,
  ];
  for (const item of candidates) {
    const v = String(item ?? '').trim();
    if (!v) continue;
    const match = v.match(/(\d)\s*bhk/i);
    if (match) return `${match[1]} BHK`;
    if (/^\d+$/.test(v)) return `${v} BHK`;
  }
  return null;
}
