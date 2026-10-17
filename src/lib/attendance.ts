export const DEFAULT_ATTENDANCE_THRESHOLD = 75;

export type AttendanceRecord = {
  avgAtt: number | null;
  totalAttendancePct: number | null;
  isDetained: boolean;
  lastListDate: Date | string | null;
  lowSubjectCount?: number | null;
};
export type EffectiveAttendance = { pct: number | null; source: "LIST" | "ROSTER" | "NONE"; listDate: Date | string | null };
export type StudentStatus = "Detained" | `AVG OK (low in ${number} subjects)` | "On track" | "No data";

export function manualAttendanceOverride(pct: number | null) {
  return {
    totalAttendancePct: pct,
    avgAtt: null,
    isDetained: false,
    detainedSubjects: "[]",
    lowSubjectCount: 0,
    lastListDate: null,
  };
}

export function detentionListAttendanceUpdate(pct: number, subjectCount: number, listDate: Date, threshold = DEFAULT_ATTENDANCE_THRESHOLD) {
  return {
    totalAttendancePct: pct,
    avgAtt: pct,
    isDetained: pct < threshold,
    lowSubjectCount: subjectCount,
    lastListDate: listDate,
  };
}

export function getEffectiveAttendance(student: AttendanceRecord): EffectiveAttendance {
  const inLatestList = student.avgAtt !== null && student.lastListDate !== null;
  if (inLatestList) return { pct: student.avgAtt, source: "LIST", listDate: student.lastListDate };
  if (student.totalAttendancePct !== null) return { pct: student.totalAttendancePct, source: "ROSTER", listDate: null };
  return { pct: null, source: "NONE", listDate: null };
}

export function getStatus(student: AttendanceRecord, threshold = DEFAULT_ATTENDANCE_THRESHOLD): StudentStatus {
  const attendance = getEffectiveAttendance(student);
  if (attendance.pct === null) return "No data";
  if (attendance.source === "LIST") {
    if (attendance.pct < threshold) return "Detained";
    const lowSubjectCount = student.lowSubjectCount ?? 0;
    if (lowSubjectCount > 0) return `AVG OK (low in ${lowSubjectCount} subjects)`;
    return "On track";
  }
  return attendance.pct < threshold ? "Detained" : "On track";
}

export function attendanceSourceLabel(attendance: EffectiveAttendance) {
  if (attendance.source === "NONE") return "";
  if (attendance.source === "ROSTER") return "Roster";
  const date = attendance.listDate ? new Date(attendance.listDate) : null;
  return date && !Number.isNaN(date.getTime()) ? `List ${date.toLocaleDateString("en-GB", { day: "numeric", month: "numeric" })}` : "List";
}

export function formatAttendance(pct: number | null) {
  if (pct === null || !Number.isFinite(pct)) return "";
  return Number.isInteger(pct) ? String(pct) : String(Number(pct.toFixed(1)));
}

export function getAttendanceView(student: AttendanceRecord, threshold = DEFAULT_ATTENDANCE_THRESHOLD) {
  const effective = getEffectiveAttendance(student);
  return { pct: effective.pct, source: effective.source, listDate: effective.listDate, sourceLabel: attendanceSourceLabel(effective), status: getStatus(student, threshold) };
}

export function isDetained(avgAttendance: number, threshold = DEFAULT_ATTENDANCE_THRESHOLD) {
  return avgAttendance < threshold;
}

export function attendanceAsPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value >= 0 && value <= 1 ? Math.round(value * 10000) / 100 : value;
}

export function shouldSkipDuplicate(previousStatuses: string[], sendAgain = false) { return !sendAgain && previousStatuses.some((status) => status === "SENT" || status === "OPENED"); }
