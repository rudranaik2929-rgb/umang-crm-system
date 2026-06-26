/** Parse comma-separated inquiry_status from assign-workspace advanced search. */
export function parseInquiryStatusFilter(value?: string | null): string[] {
  const raw = (value || '').trim();
  if (!raw || raw === 'all') return [];
  return raw.split(',').map((s) => s.trim()).filter((s) => s && s !== 'all');
}

export function serializeInquiryStatusFilter(keys: string[]): string {
  const unique = Array.from(new Set(keys.map((k) => k.trim()).filter(Boolean)));
  return unique.length ? unique.join(',') : 'all';
}

export function inquiryStatusFilterLabel(
  value: string | undefined,
  labelForKey: (key: string) => string,
): string {
  const keys = parseInquiryStatusFilter(value);
  if (!keys.length) return 'All enquiries';
  return keys.map(labelForKey).join(' · ');
}
