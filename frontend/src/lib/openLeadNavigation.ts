import { defaultRouteFor } from './constants';

/** Best page to open a lead from a notification tap (mobile-first). */
export function leadRouteForRole(
  role?: string | null,
  email?: string | null,
  allowedPages?: string[],
): string {
  const r = (role || '').toLowerCase();
  if (r === 'telecaller') return '/(app)/telecaller';
  if (r === 'sales_executive' || r === 'site_visit') return '/(app)/sales-executive';
  if (r === 'manager' || r === 'admin') return '/(app)/assign-leads';
  return defaultRouteFor(role, email, allowedPages);
}

export function leadDeepLinkPath(
  leadId: string,
  role?: string | null,
  email?: string | null,
  allowedPages?: string[],
): string {
  const base = leadRouteForRole(role, email, allowedPages);
  return `${base}?openLead=${encodeURIComponent(leadId)}`;
}
