/** Parse manager custom selection: "10" = first 10, "40-50" = positions 40–50 (1-based). */
export function parseCustomLeadSelection(input: string, total: number): { indices: number[]; error?: string } {
  const raw = String(input || '').trim();
  if (!raw) {
    return { indices: [], error: 'Enter a number or range (e.g. 10 or 40-50).' };
  }
  if (total < 1) {
    return { indices: [], error: 'No leads on screen to select.' };
  }

  const rangeMatch = raw.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1) {
      return { indices: [], error: 'Range must use positive numbers.' };
    }
    if (start > end) {
      return { indices: [], error: `Start (${start}) must be ≤ end (${end}).` };
    }
    const clampedStart = Math.min(start, total);
    const clampedEnd = Math.min(end, total);
    const indices: number[] = [];
    for (let pos = clampedStart; pos <= clampedEnd; pos += 1) {
      indices.push(pos - 1);
    }
    if (indices.length === 0) {
      return { indices: [], error: 'Range is outside the leads shown on screen.' };
    }
    return { indices };
  }

  if (/^\d+$/.test(raw)) {
    const count = parseInt(raw, 10);
    if (count < 1) {
      return { indices: [], error: 'Enter at least 1 lead to select.' };
    }
    const n = Math.min(count, total);
    return { indices: Array.from({ length: n }, (_, i) => i) };
  }

  return { indices: [], error: 'Use a number (10) or range (40-50).' };
}

export function leadIdsFromSelectionIndices(leads: { lead_id: string }[], indices: number[]): string[] {
  const ids: string[] = [];
  const seen = new Set<number>();
  for (const idx of indices) {
    if (idx < 0 || idx >= leads.length || seen.has(idx)) continue;
    seen.add(idx);
    const id = leads[idx]?.lead_id;
    if (id) ids.push(id);
  }
  return ids;
}
