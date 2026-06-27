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

export const ROLES = [
  { key: 'admin', label: 'Administrator', dept: 'Management' },
  { key: 'telecaller', label: 'Telecaller', dept: 'Telecaller Department' },
  { key: 'site_visit', label: 'Sales Executive', dept: 'Sales Executive Team' },
  { key: 'sales_executive', label: 'Sales Executive', dept: 'Sales Executive Team' },
  { key: 'booking', label: 'Booking Team', dept: 'Booking Department' },
  { key: 'loan', label: 'Loan Officer', dept: 'Loan Department' },
  { key: 'manager', label: 'Manager', dept: 'Management' },
  { key: 'marketing', label: 'Marketing Team', dept: 'Marketing Team' },
];

export function roleLabel(role?: string | null): string {
  const r = ROLES.find((x) => x.key === (role || '').toLowerCase());
  return r?.label || 'Member';
}

function normalizeRole(role?: string | null): string {
  return (role || '').trim().toLowerCase();
}

export function stageLabel(stage?: string): string {
  const s = STAGES.find((x) => x.key === stage);
  return s?.label || stage || '';
}

export const NAV_ITEMS = [
  { key: 'dashboard', path: '/(app)/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'my-dashboard', path: '/(app)/my-dashboard', label: 'My Dashboard', icon: 'person' },
  { key: 'notifications', path: '/(app)/notifications', label: 'Notifications', icon: 'notifications' },
  { key: 'pipeline', path: '/(app)/pipeline', label: 'Lead Pipeline', icon: 'pipeline' },
  { key: 'assign-leads', path: '/(app)/assign-leads', label: 'Assign Leads', icon: 'assign' },
  { key: 'telecaller', path: '/(app)/telecaller', label: 'Telecaller', icon: 'phone' },
  { key: 'sales-executive', path: '/(app)/sales-executive', label: 'Sales Executive', icon: 'visit' },
  { key: 'bookings', path: '/(app)/bookings', label: 'Bookings', icon: 'booking' },
  { key: 'loans', path: '/(app)/loans', label: 'Loan Department', icon: 'bank' },
  { key: 'integrations', path: '/(app)/integrations', label: 'Integrations', icon: 'integrations' },
  { key: 'broker', path: '/(app)/broker-leads', label: 'Broker Pool', icon: 'booking' },
  // { key: 'whatsapp', path: '/(app)/whatsapp', label: 'WhatsApp Campaigns', icon: 'wa' },
  { key: 'tracking', path: '/(app)/admin-tracking', label: 'Employee Tracking', icon: 'tracking' },
  { key: 'employees', path: '/(app)/employees', label: 'Employees', icon: 'team' },
  { key: 'negative', path: '/(app)/negative-leads', label: 'Not Interested', icon: 'archive' },
];

// Which sidebar items each role can access
export const ROLE_ACCESS: Record<string, string[]> = {
  admin: ['dashboard', 'my-dashboard', 'notifications', 'pipeline', 'assign-leads', 'telecaller', 'sales-executive', 'bookings', 'loans', 'integrations', 'broker', 'tracking', 'employees', 'negative'],
  manager: ['dashboard', 'my-dashboard', 'notifications', 'pipeline', 'assign-leads', 'bookings', 'loans', 'integrations', 'broker', 'tracking', 'employees', 'negative'],
  telecaller: ['my-dashboard', 'notifications', 'telecaller', 'pipeline', 'negative'],
  site_visit: ['my-dashboard', 'notifications', 'sales-executive', 'pipeline'],
  sales_executive: ['my-dashboard', 'notifications', 'sales-executive', 'telecaller', 'pipeline'],
  booking: ['my-dashboard', 'notifications', 'bookings', 'pipeline'],
  loan: ['my-dashboard', 'notifications', 'loans', 'pipeline'],
  marketing: ['my-dashboard', 'notifications', 'negative', 'pipeline', 'integrations'],
};

export const OWNER_EMAILS = ['htshpatil13@gmail.com', 'umang@admin'];

export function isOwner(role?: string | null, email?: string | null) {
  return role === 'admin' || (!!email && OWNER_EMAILS.includes(email.toLowerCase()));
}

/** Owner-only financial dashboard — admin/owner, not manager. */
export function canAccessOwnerDashboard(role?: string | null, email?: string | null) {
  if (role === 'manager') return false;
  return role === 'admin' || isOwner(role, email);
}

/** Main team Dashboard — managers + administrators. */
export function canAccessMainDashboard(role?: string | null, email?: string | null) {
  return role === 'manager' || canAccessOwnerDashboard(role, email);
}

const DEFAULT_ROUTES: Record<string, string> = {
  admin: '/(app)/dashboard',
  manager: '/(app)/dashboard',
  telecaller: '/(app)/telecaller',
  site_visit: '/(app)/sales-executive',
  sales_executive: '/(app)/sales-executive',
  booking: '/(app)/bookings',
  loan: '/(app)/loans',
  marketing: '/(app)/negative-leads',
};

const ROUTE_ITEMS = NAV_ITEMS;

// Services a manager can grant when adding an employee (checkbox list).
// Employee Tracking is admin/manager only — never assignable per employee.
export const EMPLOYEE_ASSIGNABLE_SERVICES = NAV_ITEMS.filter(
  (n) => n.key !== 'my-dashboard' && n.key !== 'tracking',
);

/** @deprecated use EMPLOYEE_ASSIGNABLE_SERVICES */
export const ALL_SERVICES = EMPLOYEE_ASSIGNABLE_SERVICES;

const ADMIN_MANAGER_ONLY_PAGES = new Set(['tracking']);

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
    pages = strip(ROLE_ACCESS[normalizedRole] || ROLE_ACCESS.admin);
  }
  // Manager gets main Dashboard + My Dashboard + Employee Tracking + Not Interested.
  if (normalizedRole === 'manager') {
    if (!pages.includes('dashboard')) pages = ['dashboard', ...pages];
    if (!pages.includes('my-dashboard')) pages = ['my-dashboard', ...pages];
    if (!pages.includes('tracking')) pages = [...pages, 'tracking'];
    if (!pages.includes('negative')) pages = [...pages, 'negative'];
  }
  // Employee Tracking — admin & manager only (never from per-employee grants).
  if (normalizedRole !== 'admin' && normalizedRole !== 'manager') {
    pages = pages.filter((p) => !ADMIN_MANAGER_ONLY_PAGES.has(p));
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

export function isAdmin(role?: string | null) {
  return role === 'admin' || role === 'manager';
}

export function canSeeRevenue(role?: string | null, email?: string | null) {
  return isOwner(role, email);
}

/** Booking page: manager sees same financial fields as admin/owner. */
export function canViewBookingFinance(role?: string | null, email?: string | null) {
  return isAdmin(role) || role === 'booking' || isOwner(role, email);
}

export function canAccess(role: string | null | undefined, page: string, email?: string | null, allowedPages?: string[] | null): boolean {
  const normalizedRole = normalizeRole(role);
  if (ADMIN_MANAGER_ONLY_PAGES.has(page)) {
    return normalizedRole === 'admin' || normalizedRole === 'manager';
  }
  if (page === 'dashboard') return canAccessMainDashboard(normalizedRole, email);
  return effectivePages(normalizedRole, email, allowedPages).includes(page);
}

export function pageKeyFromPathname(pathname?: string | null): string | null {
  const slug = pathname?.split('/').filter(Boolean).pop();
  if (!slug) return null;
  return ROUTE_ITEMS.find((item) => item.path.split('/').pop() === slug)?.key || null;
}

export function defaultRouteFor(role?: string | null, email?: string | null, allowedPages?: string[] | null): string {
  if (role === 'manager') return DEFAULT_ROUTES.manager;
  if (canAccessOwnerDashboard(role, email) && role === 'admin') return DEFAULT_ROUTES.admin;
  if (isOwner(role, email)) return DEFAULT_ROUTES.admin;
  // Prefer the role's natural landing if the employee has access to it,
  // otherwise land on the first granted service (always at least my-dashboard).
  const pages = effectivePages(role, email, allowedPages);
  const roleRoute = DEFAULT_ROUTES[role || ''];
  const roleKey = roleRoute ? pageKeyFromPathname(roleRoute) : null;
  if (roleKey && pages.includes(roleKey)) return roleRoute;
  const firstItem = NAV_ITEMS.find((n) => pages.includes(n.key));
  return firstItem?.path || '/(app)/my-dashboard';
}
