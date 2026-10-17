import { dateDistanceFromToday } from "./date";

export function canAccessDailySection(user: { role: string; sectionId: string | null; canMarkDailyAttendance: boolean }, sectionId: string) {
  return canViewDailySection(user, sectionId) && (user.role === "HOD" || user.canMarkDailyAttendance);
}

export function canViewDailySection(user: { role: string; sectionId: string | null }, sectionId: string) {
  return user.role === "HOD" || (user.role === "TEACHER" && user.sectionId === sectionId);
}

export function canEditDailyDate(user: { role: string }, date: string, editWindowDays: number, today: string) {
  if (user.role === "HOD") return date <= today;
  const distance = dateDistanceFromToday(date, today);
  return distance !== null && distance >= 0 && distance <= editWindowDays;
}
