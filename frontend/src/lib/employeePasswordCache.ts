/** Manager-set employee login passwords (session only — not retrievable from server hash). */
const STORAGE_KEY = 'umang_employee_login_passwords';

function readMap(): Record<string, string> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getEmployeePassword(employeeId: string | null | undefined): string {
  if (!employeeId) return '';
  return readMap()[employeeId] || '';
}

export function setEmployeePassword(employeeId: string, password: string) {
  const trimmed = (password || '').trim();
  if (!employeeId || trimmed.length < 4) return;
  const map = readMap();
  map[employeeId] = trimmed;
  writeMap(map);
}

export function clearEmployeePassword(employeeId: string) {
  const map = readMap();
  delete map[employeeId];
  writeMap(map);
}
