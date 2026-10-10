import { db } from "@/lib/db";
import { DEFAULT_SMS_TEMPLATE, DEFAULT_WHATSAPP_TEMPLATE, renderTemplate } from "@/lib/messageTemplates";
import { normalizeIndianMobile } from "@/lib/phone";
import { parseDetainedSubjects } from "@/lib/detentionSubjects";
import { DEFAULT_ATTENDANCE_THRESHOLD, formatAttendance, getEffectiveAttendance, getStatus } from "@/lib/attendance";
import { toAsciiSms } from "@/lib/messageTemplates";

export function normalizePreparedNumber(value: string): string | null {
  try { return `91${normalizeIndianMobile(value)}`; } catch { return null; }
}

export function buildPreparedText(input: { template: string; studentName: string; regNo: string; section: string; avg: number | null; subjects: string[]; date: Date; senderName: string; senderMobile: string; collegeName: string; department: string; testMode: boolean; channel?: "SMS" | "WHATSAPP" }) {
  const rendered = renderTemplate(input.template, {
    student_name: input.studentName, reg_no: input.regNo, section: input.section,
    avg: formatAttendance(input.avg), detained_count: input.subjects.length ? input.subjects.length : "",
    subjects: input.subjects.join("\n"), subjects_short: input.subjects.slice(0, 3).join(", ") + (input.subjects.length > 3 ? ` and ${input.subjects.length - 3} more` : ""),
    date: input.date.toLocaleDateString("en-GB"), sender_name: input.senderName,
    sender_mobile: input.senderMobile, college_name: input.collegeName, department: input.department,
  });
  const withoutEmptySubjects = input.subjects.length ? rendered : rendered.replace(/\bDetained in\s*(?:0\s*)?subjects\.?/gi, "").replace(/Detained subjects:\s*(?:\r?\n\s*)*/gi, "");
  const finalText = `${input.testMode ? `[TEST for ${input.studentName}] ` : ""}${withoutEmptySubjects}`.replace(/\n{3,}/g, "\n\n").trim();
  if (input.channel !== "SMS") return finalText;

  const asciiText = toAsciiSms(finalText);
  if (asciiText.length <= 306) return asciiText;

  // Existing installations may have an older, verbose template saved in Settings.
  // Preserve its key data, but keep generated SMS within the supported two-part limit.
  const testPrefix = input.testMode ? `[TEST for ${input.studentName}] ` : "";
  const intro = `Dear Parent, ${input.studentName} (Reg ${input.regNo}) has ${formatAttendance(input.avg) ?? ""}% attendance, below 75%.`;
  const ending = ` Contact ${input.senderName}. -${input.collegeName}`;
  const subjectText = input.subjects.join(", ");
  const available = Math.max(0, 306 - testPrefix.length - intro.length - ending.length - (subjectText ? " Detained: .".length + 3 : 0));
  const detail = subjectText ? ` Detained: ${subjectText.slice(0, available)}${subjectText.length > available ? "..." : ""}.` : "";
  const compact = toAsciiSms(`${testPrefix}${intro}${detail}${ending}`);
  return compact.length <= 306 ? compact : `${compact.slice(0, 303)}...`;
}

export async function regeneratePreparedMessages(sectionId?: string, senderOnlyId?: string) {
  const settings = Object.fromEntries((await db.setting.findMany()).map(x => [x.key, x.value]));
  const threshold = Number(settings.attendanceThreshold || settings.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  const allStudents = await db.student.findMany({ where: sectionId ? { sectionId } : {}, include: { section: true } });
  const eligibleStudents = allStudents.filter(student => ["Detained", "Below 75% (roster)"].includes(getStatus(student, threshold)));
  const eligibleIds = eligibleStudents.map(student => student.id);
  await db.preparedMessage.deleteMany({ where: { ...(senderOnlyId ? { senderId: senderOnlyId } : {}), ...(sectionId ? { student: { sectionId, ...(eligibleIds.length ? { id: { notIn: eligibleIds } } : {}) } } : { student: eligibleIds.length ? { id: { notIn: eligibleIds } } : {} }) } });
  const students = eligibleStudents;
  const senders = await db.user.findMany({ where: { active: true, ...(senderOnlyId ? { id: senderOnlyId } : {}), OR: [{ role: "HOD" }, { role: "TEACHER", canSend: true, sectionId: sectionId ? sectionId : { not: null } }] }, select: { id: true, name: true, mobile: true, role: true, sectionId: true } });
  for (const student of students) {
    const effective = getEffectiveAttendance(student);
    const subjects = effective.source === "LIST" ? parseDetainedSubjects(student.detainedSubjects).map(subject => `${subject.code} - ${subject.name}`) : [];
    const listDate = effective.listDate ? new Date(effective.listDate) : new Date();
    const number = normalizePreparedNumber(student.parentMobile);
    for (const sender of senders) {
      if (sender.role === "TEACHER" && sender.sectionId !== student.sectionId) continue;
      for (const channel of ["SMS", "WHATSAPP"] as const) {
        const template = channel === "SMS" ? settings.smsTemplate || DEFAULT_SMS_TEMPLATE : settings.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
        const text = buildPreparedText({ template, studentName: student.name, regNo: student.regNo, section: student.section.name, avg: effective.pct, subjects, date: listDate, senderName: sender.name, senderMobile: sender.mobile || "", collegeName: settings.collegeName || "College", department: settings.department || "Department", testMode: settings.testMode !== "false", channel });
        const key = { studentId_senderId_channel: { studentId: student.id, senderId: sender.id, channel } };
        const previous = await db.preparedMessage.findUnique({ where: key, select: { status: true } });
        const status = previous?.status === "SENT" || previous?.status === "OPENED" ? previous.status : number ? "READY" : "MISSING_NUMBER";
        await db.preparedMessage.upsert({ where: key, create: { studentId: student.id, senderId: sender.id, channel, status, toNumber: number, text, listDate }, update: { status, toNumber: number, text, listDate } });
      }
    }
  }
}

export async function ensurePreparedForSender(senderId: string, sectionId?: string) {
  await regeneratePreparedMessages(sectionId, senderId);
}
