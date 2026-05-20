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
  { key: 'admin-analytics', path: '/(app)/admin-analytics', label: 'Admin Analytics', icon: 'admin' },
  { key: 'pipeline', path: '/(app)/pipeline', label: 'Lead Pipeline', icon: 'pipeline' },
  { key: 'telecaller', path: '/(app)/telecaller', label: 'Telecaller', icon: 'phone' },
  { key: 'visits', path: '/(app)/visits', label: 'Site Visits', icon: 'visit' },
  { key: 'bookings', path: '/(app)/bookings', label: 'Bookings', icon: 'booking' },
  { key: 'loans', path: '/(app)/loans', label: 'Loan Department', icon: 'bank' },
  // { key: 'whatsapp', path: '/(app)/whatsapp', label: 'WhatsApp Campaigns', icon: 'wa' },
  { key: 'tracking', path: '/(app)/admin-tracking', label: 'Employee Tracking', icon: 'tracking' },
  { key: 'employees', path: '/(app)/employees', label: 'Employees', icon: 'team' },
  { key: 'negative', path: '/(app)/negative-leads', label: 'Negative Leads', icon: 'archive' },
];

// Which sidebar items each role can access
export const ROLE_ACCESS: Record<string, string[]> = {
  admin: ['dashboard', 'my-dashboard', 'admin-analytics', 'pipeline', 'telecaller', 'visits', 'bookings', 'loans', 'tracking', 'employees', 'negative'],
  manager: ['dashboard', 'my-dashboard', 'pipeline', 'bookings', 'loans', 'employees'],
  telecaller: ['dashboard', 'my-dashboard', 'telecaller', 'pipeline', 'negative'],
  site_visit: ['dashboard', 'my-dashboard', 'visits', 'pipeline'],
  booking: ['dashboard', 'my-dashboard', 'bookings', 'pipeline'],
  loan: ['dashboard', 'my-dashboard', 'loans', 'pipeline'],
  marketing: ['dashboard', 'my-dashboard', 'negative', 'pipeline'],
};

export function visibleNavFor(role?: string | null) {
  const r = role || 'admin';
  const allowed = ROLE_ACCESS[r] || ROLE_ACCESS.admin;
  return NAV_ITEMS.filter((n) => allowed.includes(n.key));
}

export function isAdmin(role?: string | null) {
  return role === 'admin' || role === 'manager';
}

export function canSeeRevenue(role?: string | null) {
  return role === 'admin';
}

export function canAccess(role: string | null | undefined, page: string): boolean {
  const r = role || 'admin';
  return (ROLE_ACCESS[r] || ROLE_ACCESS.admin).includes(page);
}
