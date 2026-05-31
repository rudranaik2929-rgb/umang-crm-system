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
