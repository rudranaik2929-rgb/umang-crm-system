export const STAGES = [
  { key: 'new', label: 'New Lead' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'positive', label: 'Positive' },
  { key: 'site_visit', label: 'Sales Follow-up' },
  { key: 'booking', label: 'Booking' },
  { key: 'loan', label: 'Loan' },
  { key: 'registration', label: 'Registration' },
  { key: 'closed', label: 'Closed' },
];

export const STAGE_COLORS: Record<string, string> = {
  new: '#0284C7',
  assigned: '#8B5CF6',
  contacted: '#6366F1',
  positive: '#059669',
  site_visit: '#D4AF37',
  booking: '#D97706',
  loan: '#7C3AED',
  registration: '#0891B2',
  closed: '#10B981',
  negative: '#E11D48',
};

export const TEAM_LEAD_ROLE = 'team_lead';

export const ROLES = [
  { key: 'admin', label: 'Administrator', dept: 'Management' },
  { key: 'team_lead', label: 'Team Lead', dept: 'Team Leads' },
  { key: 'telecaller', label: 'Telecaller', dept: 'Telecaller Department' },
  { key: 'site_visit', label: 'Sales Executive', dept: 'Sales Executive Team' },
  { key: 'sales_executive', label: 'Sales Executive', dept: 'Sales Executive Team' },
  { key: 'booking', label: 'Booking Team', dept: 'Booking Department' },
  { key: 'loan', label: 'Loan Officer', dept: 'Loan Department' },
  { key: 'marketing', label: 'Marketing Team', dept: 'Marketing Team' },
];

/** Lower-case role key. Accounts saved before the Team Lead change still say
 *  "manager" — they are treated exactly as Team Leads. */
export function normalizeRole(role?: string | null): string {
  const r = (role || '').trim().toLowerCase();
  return r === 'manager' ? TEAM_LEAD_ROLE : r;
}

export function roleLabel(role?: string | null): string {
  const r = ROLES.find((x) => x.key === normalizeRole(role));
  return r?.label || 'Member';
}

export function stageLabel(stage?: string): string {
  const s = STAGES.find((x) => x.key === stage);
  return s?.label || stage || '';
}

export const NAV_ITEMS = [
  { key: 'dashboard', path: '/(app)/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'my-dashboard', path: '/(app)/my-dashboard', label: 'My Dashboard', icon: 'person' },
  { key: 'pipeline', path: '/(app)/pipeline', label: 'Lead Pipeline', icon: 'pipeline' },
  { key: 'assign-leads', path: '/(app)/assign-leads', label: 'Assign Leads', icon: 'assign' },
  { key: 'teams', path: '/(app)/teams', label: 'Teams & Regions', icon: 'teams' },
  { key: 'telecaller', path: '/(app)/telecaller', label: 'Telecaller', icon: 'phone' },
  { key: 'sales-executive', path: '/(app)/sales-executive', label: 'Sales Executive', icon: 'visit' },
  { key: 'bookings', path: '/(app)/bookings', label: 'Bookings', icon: 'booking' },
  { key: 'loans', path: '/(app)/loans', label: 'Loan Department', icon: 'bank' },
  { key: 'integrations', path: '/(app)/integrations', label: 'Integrations', icon: 'integrations' },
  { key: 'broker', path: '/(app)/broker-leads', label: 'Broker Pool', icon: 'booking' },
  // { key: 'whatsapp', path: '/(app)/whatsapp', label: 'WhatsApp Campaigns', icon: 'wa' },
  { key: 'tracking', path: '/(app)/admin-tracking', label: 'Employee Tracking', icon: 'tracking' },
  { key: 'employees', path: '/(app)/employees', label: 'Employees', icon: 'team' },
  { key: 'export-leads', path: '/(app)/export-leads', label: 'Export Leads', icon: 'export' },
  { key: 'negative', path: '/(app)/negative-leads', label: 'Not Interested', icon: 'archive' },
];

// Which sidebar items each role can access
export const ROLE_ACCESS: Record<string, string[]> = {
  admin: ['dashboard', 'my-dashboard', 'pipeline', 'assign-leads', 'teams', 'telecaller', 'sales-executive', 'bookings', 'loans', 'integrations', 'broker', 'tracking', 'employees', 'export-leads', 'negative'],
  // Team Lead: their own team's dashboard, leads, people and exports.
  // Integrations (new-lead intake) and Teams & Regions stay with the admin.
  team_lead: ['dashboard', 'my-dashboard', 'pipeline', 'assign-leads', 'broker', 'tracking', 'employees', 'export-leads', 'negative'],
  telecaller: ['my-dashboard', 'telecaller', 'pipeline', 'negative'],
  site_visit: ['my-dashboard', 'sales-executive', 'pipeline'],
  sales_executive: ['my-dashboard', 'sales-executive', 'telecaller', 'pipeline'],
  booking: ['my-dashboard', 'bookings', 'pipeline'],
  loan: ['my-dashboard', 'loans', 'pipeline'],
  marketing: ['my-dashboard', 'negative', 'pipeline', 'integrations'],
};

export const OWNER_EMAILS = ['htshpatil13@gmail.com', 'umang@admin'];

export function isOwner(role?: string | null, email?: string | null) {
  return normalizeRole(role) === 'admin' || (!!email && OWNER_EMAILS.includes(email.toLowerCase()));
}

export function isTeamLead(role?: string | null) {
  return normalizeRole(role) === TEAM_LEAD_ROLE;
}

/** Administrator only (company-wide control, deletes, Teams & Regions). */
export function isAdminRole(role?: string | null, email?: string | null) {
  return isOwner(role, email);
}

/** Admin or Team Lead — people who assign and supervise leads.
 *  The backend limits a Team Lead to their own team. */
export function isSupervisor(role?: string | null, email?: string | null) {
  return isOwner(role, email) || isTeamLead(role);
}

/** Owner-only financial dashboard — administrators, not Team Leads. */
export function canAccessOwnerDashboard(role?: string | null, email?: string | null) {
  if (isTeamLead(role)) return false;
  return isOwner(role, email);
}

/** Main Dashboard — administrators (company) and Team Leads (their team). */
export function canAccessMainDashboard(role?: string | null, email?: string | null) {
  return isTeamLead(role) || canAccessOwnerDashboard(role, email);
}

const DEFAULT_ROUTES: Record<string, string> = {
  admin: '/(app)/dashboard',
  team_lead: '/(app)/dashboard',
  telecaller: '/(app)/telecaller',
  site_visit: '/(app)/sales-executive',
  sales_executive: '/(app)/sales-executive',
  booking: '/(app)/bookings',
  loan: '/(app)/loans',
  marketing: '/(app)/negative-leads',
};

const ROUTE_ITEMS = NAV_ITEMS;

// Pages that come with the role, never granted per employee.
const SUPERVISOR_ONLY_PAGES = new Set(['tracking', 'export-leads']);
const ADMIN_ONLY_PAGES = new Set(['teams']);
// A Team Lead always has these (they cannot be unticked).
const TEAM_LEAD_CORE_PAGES = ['dashboard', 'my-dashboard', 'assign-leads', 'employees', 'export-leads', 'tracking', 'negative'];

// Services that can be granted when adding an employee (checkbox list).
export const EMPLOYEE_ASSIGNABLE_SERVICES = NAV_ITEMS.filter(
  (n) => n.key !== 'my-dashboard' && !SUPERVISOR_ONLY_PAGES.has(n.key) && !ADMIN_ONLY_PAGES.has(n.key),
);

/** @deprecated use EMPLOYEE_ASSIGNABLE_SERVICES */
export const ALL_SERVICES = EMPLOYEE_ASSIGNABLE_SERVICES;

// Resolve the effective set of accessible page keys for a user. Per-employee
// allowed_pages is the source of truth; owners always get everything; legacy
// users with no explicit list fall back to role defaults.
const DEPRECATED_PAGE_KEYS = ['follow-ups', 'visits'];

export function effectivePages(role?: string | null, email?: string | null, allowedPages?: string[] | null): string[] {
  const normalizedRole = normalizeRole(role);
  const strip = (keys: string[]) => keys.filter((k) => !DEPRECATED_PAGE_KEYS.includes(k));
  let pages: string[];
  if (isOwner(normalizedRole, email)) {
    pages = strip(NAV_ITEMS.map((n) => n.key));
  } else if (Array.isArray(allowedPages) && allowedPages.length > 0) {
    pages = strip(Array.from(new Set(['my-dashboard', ...allowedPages])));
  } else {
    pages = strip(ROLE_ACCESS[normalizedRole] || ROLE_ACCESS.telecaller);
  }
  if (normalizedRole === TEAM_LEAD_ROLE) {
    pages = Array.from(new Set([...TEAM_LEAD_CORE_PAGES, ...pages]));
    // Company-level pages stay with the admin.
    pages = pages.filter((p) => p !== 'bookings' && p !== 'loans' && p !== 'integrations');
  }
  // Booking employees always need the Bookings page for manual leads & new bookings.
  if (normalizedRole === 'booking' && !pages.includes('bookings')) {
    pages = [...pages, 'bookings'];
  }
  if (!isOwner(normalizedRole, email)) {
    pages = pages.filter((p) => !ADMIN_ONLY_PAGES.has(p));
    if (normalizedRole !== TEAM_LEAD_ROLE) {
      pages = pages.filter((p) => !SUPERVISOR_ONLY_PAGES.has(p));
    }
  }
  return pages;
}

export function visibleNavFor(role?: string | null, email?: string | null, allowedPages?: string[] | null) {
  return NAV_ITEMS.filter((n) => canAccess(role, n.key, email, allowedPages));
}

export const PLATFORM_LABELS: Record<string, string> = {
  manual: 'Database',
  housing: 'Housing.com',
  meta: 'Meta (Facebook)',
  other: 'Other Sources',
  brokerage: 'Broker Pool',
};

export function platformLabel(key?: string | null): string {
  if (!key) return 'Other Sources';
  return PLATFORM_LABELS[key] || key;
}

/** @deprecated Same as isSupervisor (admin or Team Lead). Use isAdminRole for
 *  admin-only actions such as deleting leads. */
export function isAdmin(role?: string | null) {
  return isSupervisor(role);
}

/** Telecaller / sales can move their own assigned leads to broker pool (same as a Team Lead). */
export function canMoveLeadToBrokerPool(role?: string | null) {
  const r = normalizeRole(role);
  return isSupervisor(r)
    || r === 'telecaller'
    || r === 'sales_executive'
    || r === 'site_visit';
}

/** Deleting a lead is permanent — administrators only. */
export function canDeleteLeads(role?: string | null, email?: string | null) {
  return isAdminRole(role, email);
}

export function canSeeRevenue(role?: string | null, email?: string | null) {
  return isOwner(role, email);
}

/** Booking page: Team Leads see the same financial fields as admin/owner. */
export function canViewBookingFinance(role?: string | null, email?: string | null) {
  return isSupervisor(role, email) || normalizeRole(role) === 'booking';
}

/** Manual walk-in lead for booking queue — booking team + admin / Team Lead. */
export function canAddBookingManualLead(role?: string | null) {
  const r = normalizeRole(role);
  return r === 'booking' || r === 'admin' || r === TEAM_LEAD_ROLE;
}

export function canAccess(role: string | null | undefined, page: string, email?: string | null, allowedPages?: string[] | null): boolean {
  const normalizedRole = normalizeRole(role);
  if (ADMIN_ONLY_PAGES.has(page)) return isOwner(normalizedRole, email);
  if (SUPERVISOR_ONLY_PAGES.has(page)) return isSupervisor(normalizedRole, email);
  if (page === 'dashboard') return canAccessMainDashboard(normalizedRole, email);
  return effectivePages(normalizedRole, email, allowedPages).includes(page);
}

export function pageKeyFromPathname(pathname?: string | null): string | null {
  const slug = pathname?.split('/').filter(Boolean).pop();
  if (!slug) return null;
  return ROUTE_ITEMS.find((item) => item.path.split('/').pop() === slug)?.key || null;
}

export function defaultRouteFor(role?: string | null, email?: string | null, allowedPages?: string[] | null): string {
  const r = normalizeRole(role);
  if (r === TEAM_LEAD_ROLE) return DEFAULT_ROUTES.team_lead;
  if (isOwner(r, email)) return DEFAULT_ROUTES.admin;
  // Prefer the role's natural landing if the employee has access to it,
  // otherwise land on the first granted service (always at least my-dashboard).
  const pages = effectivePages(r, email, allowedPages);
  const roleRoute = DEFAULT_ROUTES[r];
  const roleKey = roleRoute ? pageKeyFromPathname(roleRoute) : null;
  if (roleKey && pages.includes(roleKey)) return roleRoute;
  const firstItem = NAV_ITEMS.find((n) => pages.includes(n.key));
  return firstItem?.path || '/(app)/my-dashboard';
}

/** Region list label: ['*'] means every region. */
export const ALL_REGIONS = '*';

export function regionsLabel(regions?: string[] | null): string {
  if (!regions || regions.length === 0) return 'No region set';
  if (regions.includes(ALL_REGIONS)) return 'All regions';
  return regions.join(', ');
}
