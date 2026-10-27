import { defaultRouteFor, isSupervisor, normalizeRole } from './constants';

/** Best page to open a lead from a notification tap (mobile-first). */
export function leadRouteForRole(
  role?: string | null,
  email?: string | null,
  allowedPages?: string[] | null,
): string {
  const r = normalizeRole(role);
  if (r === 'telecaller') return '/(app)/telecaller';
  if (r === 'sales_executive' || r === 'site_visit') return '/(app)/sales-executive';
  // Admins and Team Leads hand leads out from Assign Leads.
  if (isSupervisor(r, email)) return '/(app)/assign-leads';
  return defaultRouteFor(role, email, allowedPages);
}

export function leadDeepLinkPath(
  leadId: string,
  role?: string | null,
  email?: string | null,
  allowedPages?: string[] | null,
): string {
  const base = leadRouteForRole(role, email, allowedPages);
  return `${base}?openLead=${encodeURIComponent(leadId)}`;
}
