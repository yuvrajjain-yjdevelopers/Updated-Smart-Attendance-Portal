export const ATTENDANCE_TIME_ZONE = "Asia/Kolkata";

export function todayInIndia(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ATTENDANCE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function parseAttendanceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function dateDistanceFromToday(value: string, today = todayInIndia()) {
  const target = parseAttendanceDate(value);
  const current = parseAttendanceDate(today);
  return target && current ? Math.round((current.getTime() - target.getTime()) / 86_400_000) : null;
}
