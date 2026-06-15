export type Time12Parts = { hour12: number; minute: number; period: 'AM' | 'PM' };

export function parseTime24(time24: string): Time12Parts {
  const [hRaw, mRaw = '0'] = String(time24 || '11:00').split(':');
  const h24 = Number(hRaw);
  const minute = Number(mRaw) || 0;
  const safeH = Number.isFinite(h24) ? Math.min(23, Math.max(0, h24)) : 11;
  const period: 'AM' | 'PM' = safeH >= 12 ? 'PM' : 'AM';
  const hour12 = safeH % 12 || 12;
  return { hour12, minute: Math.min(59, Math.max(0, minute)), period };
}

export function toTime24(parts: Time12Parts): string {
  let h = parts.hour12 % 12;
  if (parts.period === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function formatTime12h(time24?: string | null): string {
  if (!time24) return '—';
  const { hour12, minute, period } = parseTime24(time24);
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

export function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return 'Select date';
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dayNameFromIso(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { weekday: 'long' });
}
