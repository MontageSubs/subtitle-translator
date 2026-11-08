const UNIFIED_INCIDENT_ID_PATTERN = /^inc_\d{14}_[0-9a-f]{12}$/;

export const isUnifiedIncidentId = (id: string): boolean => UNIFIED_INCIDENT_ID_PATTERN.test(id);

export function generateMessageId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(-12);
}

export function generateUnifiedIncidentId(
  dateInput?: Date | string | number,
): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
  const ts = validDate.toISOString().replace(/\D/g, "").slice(0, 14);
  const uuidTail = crypto.randomUUID().replace(/-/g, "").slice(-12);
  return `inc_${ts}_${uuidTail}`;
}
