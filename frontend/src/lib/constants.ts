export const STAGES = [
  { key: 'new', label: 'New Lead' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'positive', label: 'Positive' },
  { key: 'site_visit', label: 'Site Visit' },
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
  { key: 'site_visit', label: 'Site Visit Executive', dept: 'Site Visit Team' },
  { key: 'booking', label: 'Booking Team', dept: 'Booking Department' },
  { key: 'loan', label: 'Loan Officer', dept: 'Loan Department' },
  { key: 'manager', label: 'Manager', dept: 'Management' },
  { key: 'marketing', label: 'Marketing Team', dept: 'Marketing Team' },
];

export function roleLabel(role?: string | null): string {
  const r = ROLES.find((x) => x.key === role);
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
  { key: 'telecaller', path: '/(app)/telecaller', label: 'Telecaller', icon: 'phone' },
  { key: 'visits', path: '/(app)/visits', label: 'Site Visits', icon: 'visit' },
  { key: 'bookings', path: '/(app)/bookings', label: 'Bookings', icon: 'booking' },
  { key: 'loans', path: '/(app)/loans', label: 'Loan Department', icon: 'bank' },
  { key: 'integrations', path: '/(app)/integrations', label: 'Integrations', icon: 'integrations' },
  // { key: 'whatsapp', path: '/(app)/whatsapp', label: 'WhatsApp Campaigns', icon: 'wa' },
  { key: 'tracking', path: '/(app)/admin-tracking', label: 'Employee Tracking', icon: 'tracking' },
  { key: 'employees', path: '/(app)/employees', label: 'Employees', icon: 'team' },
  { key: 'negative', path: '/(app)/negative-leads', label: 'Negative Leads', icon: 'archive' },
];

// Which sidebar items each role can access
export const ROLE_ACCESS: Record<string, string[]> = {
  admin: ['dashboard', 'my-dashboard', 'pipeline', 'telecaller', 'visits', 'bookings', 'loans', 'integrations', 'tracking', 'employees', 'negative'],
  manager: ['my-dashboard', 'pipeline', 'bookings', 'loans', 'integrations', 'employees'],
  telecaller: ['my-dashboard', 'telecaller', 'pipeline', 'negative'],
  site_visit: ['my-dashboard', 'visits', 'pipeline'],
  booking: ['my-dashboard', 'bookings', 'pipeline'],
  loan: ['my-dashboard', 'loans', 'pipeline'],
  marketing: ['my-dashboard', 'negative', 'pipeline', 'integrations'],
};

export const OWNER_EMAILS = ['htshpatil13@gmail.com', 'umang@admin'];

export function isOwner(role?: string | null, email?: string | null) {
  return role === 'admin' || (!!email && OWNER_EMAILS.includes(email.toLowerCase()));
}

const DEFAULT_ROUTES: Record<string, string> = {
  admin: '/(app)/dashboard',
  manager: '/(app)/my-dashboard',
  telecaller: '/(app)/telecaller',
  site_visit: '/(app)/visits',
  booking: '/(app)/bookings',
  loan: '/(app)/loans',
  marketing: '/(app)/negative-leads',
};

const ROUTE_ITEMS = NAV_ITEMS;

export function visibleNavFor(role?: string | null, email?: string | null) {
  return NAV_ITEMS.filter((n) => canAccess(role, n.key, email));
}

export function isAdmin(role?: string | null) {
  return role === 'admin' || role === 'manager';
}

export function canSeeRevenue(role?: string | null, email?: string | null) {
  return isOwner(role, email);
}

export function canAccess(role: string | null | undefined, page: string, email?: string | null): boolean {
  if (page === 'dashboard') return isOwner(role, email);
  const r = role || 'admin';
  return (ROLE_ACCESS[r] || ROLE_ACCESS.admin).includes(page);
}

export function pageKeyFromPathname(pathname?: string | null): string | null {
  const slug = pathname?.split('/').filter(Boolean).pop();
  if (!slug) return null;
  return ROUTE_ITEMS.find((item) => item.path.split('/').pop() === slug)?.key || null;
}

export function defaultRouteFor(role?: string | null, email?: string | null): string {
  if (isOwner(role, email)) return DEFAULT_ROUTES.admin;
  return DEFAULT_ROUTES[role || ''] || '/(app)/my-dashboard';
}
