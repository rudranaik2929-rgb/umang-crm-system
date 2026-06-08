export function leadToFollowUpCard(lead: any) {
  const at = lead?.follow_up_at || '';
  const parsed = at ? new Date(at) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime());
  return {
    followup_id: lead?.lead_id,
    lead_id: lead?.lead_id,
    lead_name: lead?.name || 'Lead',
    follow_up_at: at,
    follow_up_date: valid ? parsed!.toISOString().slice(0, 10) : at.slice(0, 10),
    follow_up_time: valid ? parsed!.toISOString().slice(11, 16) : '',
    follow_up_day: valid ? parsed!.toLocaleDateString('en-IN', { weekday: 'long' }) : '',
    employee_name: lead?.employee_name,
  };
}
