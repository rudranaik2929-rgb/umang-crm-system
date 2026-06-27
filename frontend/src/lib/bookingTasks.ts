export const BOOKING_TASKS = [
  { key: 'login_file', label: 'Login File', status: 'login file', icon: 'folder-open-outline' as const, color: '#0284C7' },
  { key: 'sanctioned', label: 'Sanctioned', status: 'sanctioned', icon: 'checkmark-done-outline' as const, color: '#111827' },
  { key: 'registration', label: 'Registration', status: 'registration', icon: 'document-text-outline' as const, color: '#7C3AED' },
  { key: 'disbursement', label: 'Disbursement', status: 'disbursement', icon: 'cash-outline' as const, color: '#059669' },
  { key: 'bill_submitted', label: 'Bill Submitted', status: 'bill submitted', icon: 'receipt-outline' as const, color: '#D97706' },
  { key: 'amount_received', label: 'Amt Received', status: 'amount received', icon: 'wallet-outline' as const, color: '#10B981' },
] as const;

export type BookingTaskKey = typeof BOOKING_TASKS[number]['key'];

const STATUS_BY_KEY = Object.fromEntries(BOOKING_TASKS.map((t) => [t.key, t.status]));
const KEY_BY_STATUS = Object.fromEntries(BOOKING_TASKS.map((t) => [t.status, t.key]));

export function normalizeCompletedTasks(booking: any): string[] {
  if (Array.isArray(booking?.completed_tasks)) {
    return booking.completed_tasks.map((x: unknown) => String(x)).filter(Boolean);
  }
  const status = String(booking?.status || '').toLowerCase().trim();
  const key = KEY_BY_STATUS[status];
  return key ? [key] : [];
}

export function bookingMatchesTask(booking: any, taskKey: string): boolean {
  const status = String(booking?.status || '').toLowerCase().trim();
  if (status === 'cancellation' || status === 'cancelled') return false;
  const completed = normalizeCompletedTasks(booking);
  if (completed.includes(taskKey)) return true;
  return STATUS_BY_KEY[taskKey] === status;
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
