const MS_PER_SECOND = 1_000;
const CENTIS_PER_SECOND = 100;
const TIMESTAMP_PATTERN = /^(?:(\d+):)?(\d+):(\d+)[,.](\d+)$/;

const pad = (value: number, width: number) => String(value).padStart(width, "0");

function splitSeconds(totalSeconds: number): { hours: number; minutes: number; seconds: number } {
  return { hours: Math.floor(totalSeconds / 3600), minutes: Math.floor((totalSeconds % 3600) / 60), seconds: totalSeconds % 60 };
}

function splitMillis(ms: number): { hours: number; minutes: number; seconds: number; millis: number } {
  const clamped = Math.max(0, Math.round(ms));
  return { ...splitSeconds(Math.floor(clamped / MS_PER_SECOND)), millis: clamped % MS_PER_SECOND };
}

export function msToSrtTime(ms: number): string {
  const { hours, minutes, seconds, millis } = splitMillis(ms);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

export function msToVttTime(ms: number): string {
  return msToSrtTime(ms).replace(",", ".");
}

export function msToAssTime(ms: number): string {
  const totalCentis = Math.round(Math.max(0, ms) / 10);
  const { hours, minutes, seconds } = splitSeconds(Math.floor(totalCentis / CENTIS_PER_SECOND));
  return `${hours}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(totalCentis % CENTIS_PER_SECOND, 2)}`;
}

export function timeToMs(value: string): number {
  const [, hours = "0", minutes, seconds, fraction] = TIMESTAMP_PATTERN.exec(value.trim())!;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * MS_PER_SECOND + Number(fraction);
}

export function parseAssTimestamp(value: string): number {
  const [hours, minutes, rest] = value.trim().split(":");
  const [seconds, centis] = rest.split(".");
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * MS_PER_SECOND + Number(centis) * 10;
}
