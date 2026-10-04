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
