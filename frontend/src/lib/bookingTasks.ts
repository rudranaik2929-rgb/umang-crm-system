export const BOOKING_TASKS = [
  { key: 'login_file', label: 'Login File', status: 'login file', icon: 'folder-open-outline' as const, color: '#0284C7' },
  { key: 'sanctioned', label: 'Sanctioned', status: 'sanctioned', icon: 'checkmark-done-outline' as const, color: '#111827' },
  { key: 'registration', label: 'Registration', status: 'registration', icon: 'document-text-outline' as const, color: '#7C3AED' },
  { key: 'disbursement', label: 'Disbursement', status: 'disbursement', icon: 'cash-outline' as const, color: '#059669' },
  { key: 'bill_submitted', label: 'Bill Submitted', status: 'bill submitted', icon: 'receipt-outline' as const, color: '#D97706' },
  { key: 'amount_received', label: 'Amt Received', status: 'amount received', icon: 'wallet-outline' as const, color: '#10B981' },
] as const;

export type BookingTaskKey = typeof BOOKING_TASKS[number]['key'];

const TASK_KEYS = BOOKING_TASKS.map((t) => t.key) as string[];
const KEY_BY_STATUS = Object.fromEntries(BOOKING_TASKS.map((t) => [t.status, t.key]));

/**
 * Completed task keys for a booking. Accepts either task keys
 * ("bill_submitted") or stage statuses ("bill submitted") stored in
 * `completed_tasks`; falls back to mapping the `status` field when no list
 * is present.
 */
export function normalizeCompletedTasks(booking: any): string[] {
  let raw: unknown = booking?.completed_tasks;
  if (typeof raw === 'string' && raw.trim()) {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (Array.isArray(raw)) {
    const keys = new Set<string>();
    raw.forEach((entry) => {
      const low = String(entry).toLowerCase().trim();
      if (TASK_KEYS.includes(low)) keys.add(low);
      else if (KEY_BY_STATUS[low]) keys.add(KEY_BY_STATUS[low]);
    });
    return Array.from(keys);
  }
  const status = String(booking?.status || '').toLowerCase().trim();
  const key = KEY_BY_STATUS[status] || (TASK_KEYS.includes(status) ? status : null);
  return key ? [key] : [];
}

/**
 * The single pipeline box a booking currently sits in (exclusive), mirroring
 * the backend `booking_current_stage_key`.
 *
 * It is the FURTHEST completed step, so a file whose bill is submitted shows
 * under "Bill Submitted", a sanctioned file under "Sanctioned", etc. A file
 * only leaves a box once the NEXT step is done — e.g. a file in "Login File"
 * moves to "Sanctioned" when its sanction completes (Login File −1,
 * Sanctioned +1) instead of being counted in both.
 *
 * Returns `null` for cancelled bookings, and for brand-new files that have not
 * reached any step yet (they still show under Total Leads / Active Bookings).
 */
export function bookingCurrentStageKey(booking: any): string | null {
  const status = String(booking?.status || '').toLowerCase().trim();
  if (status === 'cancellation' || status === 'cancelled') return null;
  if (String(booking?.agreement_status || '').toLowerCase().trim() === 'cancelled') return null;
  let reached = -1;
  const mark = (key?: string | null) => {
    if (!key) return;
    const index = BOOKING_TASKS.findIndex((t) => t.key === key);
    if (index > reached) reached = index;
  };
  normalizeCompletedTasks(booking).forEach((key) => mark(key));
  mark(KEY_BY_STATUS[status] || (TASK_KEYS.includes(status) ? status : null));
  return reached >= 0 ? BOOKING_TASKS[reached].key : null;
}

export function bookingMatchesTask(booking: any, taskKey: string): boolean {
  return bookingCurrentStageKey(booking) === taskKey;
}

export function countBookingTasks(bookings: any[]): Record<BookingTaskKey, number> {
  const counts = Object.fromEntries(BOOKING_TASKS.map((t) => [t.key, 0])) as Record<BookingTaskKey, number>;
  bookings.forEach((booking) => {
    BOOKING_TASKS.forEach((task) => {
      if (bookingMatchesTask(booking, task.key)) counts[task.key] += 1;
    });
  });
  return counts;
}

/** Dashboard pipeline boxes — registration already shown as lead bucket, so 5 extras + 8 lead = 13. */
export const DASHBOARD_BOOKING_TASK_KEYS: BookingTaskKey[] = [
  'login_file',
  'sanctioned',
  'disbursement',
  'bill_submitted',
  'amount_received',
];
