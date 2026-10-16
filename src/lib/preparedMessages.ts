import { db } from "@/lib/db";
import { getSmsMetrics, getTrilingualSmsTemplate, getTrilingualWhatsAppTemplate, normalizeSmsText, renderTemplate, toAsciiSms } from "@/lib/messageTemplates";
import { normalizeIndianMobile } from "@/lib/phone";
import { parseDetainedSubjects } from "@/lib/detentionSubjects";
import { DEFAULT_ATTENDANCE_THRESHOLD, formatAttendance, getEffectiveAttendance, getStatus } from "@/lib/attendance";

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

  const smsText = normalizeSmsText(finalText);
  if (getSmsMetrics(smsText).parts <= 2) return smsText;
  // Preserve localized text and let the Send Center prevent an over-limit SMS.
  if (getSmsMetrics(smsText).encoding === "Unicode") return smsText;

  // Existing installations may have an older, verbose template saved in Settings.
  // Preserve its key data, but keep generated SMS within the supported two-part limit.
  const testPrefix = input.testMode ? `[TEST for ${input.studentName}] ` : "";
  const intro = `Dear Parent, ${input.studentName} (Reg ${input.regNo}) has ${formatAttendance(input.avg) ?? ""}% attendance, below 75%.`;
  const ending = ` Contact ${input.senderName} (${input.senderMobile}). -${input.collegeName}`;
  const subjectText = input.subjects.join(", ");
  const available = Math.max(0, 306 - testPrefix.length - intro.length - ending.length - (subjectText ? " Detained: .".length + 3 : 0));
  const detail = subjectText ? ` Detained: ${subjectText.slice(0, available)}${subjectText.length > available ? "..." : ""}.` : "";
  const compact = toAsciiSms(`${testPrefix}${intro}${detail}${ending}`);
  return compact.length <= 306 ? compact : `${compact.slice(0, 303)}...`;
}

export async function regeneratePreparedMessages(sectionId?: string, senderOnlyId?: string) {
  const [settingRows, allStudents, senders] = await Promise.all([
    db.setting.findMany({ select: { key: true, value: true } }),
    db.student.findMany({ where: sectionId ? { sectionId } : {}, include: { section: true } }),
    db.user.findMany({ where: { active: true, ...(senderOnlyId ? { id: senderOnlyId } : {}), OR: [{ role: "HOD" }, { role: "TEACHER", canSend: true, sectionId: sectionId ? sectionId : { not: null } }] }, select: { id: true, name: true, mobile: true, role: true, sectionId: true } }),
  ]);
  const settings = Object.fromEntries(settingRows.map(x => [x.key, x.value]));
  const threshold = Number(settings.attendanceThreshold || settings.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  const eligibleStudents = allStudents.filter(student => ["Detained"].includes(getStatus(student, threshold)));
  const senderIds = senders.map(sender => sender.id);
  const existingRows = senderIds.length ? await db.preparedMessage.findMany({
    where: { senderId: { in: senderIds }, ...(sectionId ? { student: { sectionId } } : {}) },
    select: { id: true, studentId: true, senderId: true, channel: true, status: true, toNumber: true, text: true, listDate: true },
  }) : [];
  const existingByKey = new Map(existingRows.map(row => [`${row.studentId}:${row.senderId}:${row.channel}`, row]));
  const desiredKeys = new Set<string>();
  const writes = [];
  for (const student of eligibleStudents) {
    const effective = getEffectiveAttendance(student);
    const subjects = effective.source === "LIST" ? parseDetainedSubjects(student.detainedSubjects).map(subject => `${subject.code} - ${subject.name}`) : [];
    const listDate = effective.listDate ? new Date(effective.listDate) : null;
    const number = normalizePreparedNumber(student.parentMobile);
    for (const sender of senders) {
      if (sender.role === "TEACHER" && sender.sectionId !== student.sectionId) continue;
      for (const channel of ["SMS", "WHATSAPP"] as const) {
        const template = channel === "SMS" ? getTrilingualSmsTemplate(settings) : getTrilingualWhatsAppTemplate(settings);
        const text = buildPreparedText({ template, studentName: student.name, regNo: student.regNo, section: student.section.name, avg: effective.pct, subjects, date: listDate || new Date(0), senderName: sender.name, senderMobile: sender.mobile || "", collegeName: settings.collegeName || "College", department: settings.department || "Department", testMode: settings.testMode !== "false", channel });
        const compoundKey = `${student.id}:${sender.id}:${channel}`;
        desiredKeys.add(compoundKey);
        const previous = existingByKey.get(compoundKey);
        const status = previous?.status === "SENT" || previous?.status === "OPENED" ? previous.status : number ? "READY" : "MISSING_NUMBER";
        const previousListDate = previous?.listDate?.getTime() ?? null;
        const nextListDate = listDate?.getTime() ?? null;
        const changed = !previous || previous.status !== status || previous.toNumber !== number || previous.text !== text || previousListDate !== nextListDate;
        if (!changed) continue;
        const key = { studentId_senderId_channel: { studentId: student.id, senderId: sender.id, channel } };
        writes.push(db.preparedMessage.upsert({ where: key, create: { studentId: student.id, senderId: sender.id, channel, status, toNumber: number, text, listDate }, update: { status, toNumber: number, text, listDate } }));
      }
    }
  }
  const staleIds = existingRows.filter(row => !desiredKeys.has(`${row.studentId}:${row.senderId}:${row.channel}`)).map(row => row.id);
  for (let index = 0; index < staleIds.length; index += 500) {
    await db.preparedMessage.deleteMany({ where: { id: { in: staleIds.slice(index, index + 500) } } });
  }
  for (let index = 0; index < writes.length; index += 200) {
    await db.$transaction(writes.slice(index, index + 200));
  }
}

export async function ensurePreparedForSender(senderId: string, sectionId?: string) {
  const [settingRows, students, existing] = await Promise.all([
    db.setting.findMany({ where: { key: { in: ["attendanceThreshold", "threshold"] } }, select: { key: true, value: true } }),
    db.student.findMany({ where: sectionId ? { sectionId } : {}, select: { id: true, avgAtt: true, totalAttendancePct: true, lastListDate: true, isDetained: true, lowSubjectCount: true } }),
    db.preparedMessage.findMany({ where: { senderId, ...(sectionId ? { student: { sectionId } } : {}) }, select: { studentId: true, channel: true } }),
  ]);
  const settings = Object.fromEntries(settingRows.map(row => [row.key, row.value]));
  const threshold = Number(settings.attendanceThreshold || settings.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  const expected = new Set<string>();
  for (const student of students) {
    if (!["Detained"].includes(getStatus(student, threshold))) continue;
    expected.add(`${student.id}:SMS`);
    expected.add(`${student.id}:WHATSAPP`);
  }
  if (expected.size === existing.length && existing.every(row => expected.has(`${row.studentId}:${row.channel}`))) return;
  await regeneratePreparedMessages(sectionId, senderId);
}
