export function formatUtcTimestamp(dateInput: Date | string | number): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getUTCMonth()];
  const day = d.getUTCDate();
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  return `${month} ${day}, ${hours}:${minutes} UTC`;
}
