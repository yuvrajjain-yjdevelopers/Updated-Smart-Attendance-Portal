import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { normalizePreparedNumber } from "@/lib/preparedMessages";
import { canReusePreparedMessage } from "@/lib/preparedMessages";
import { buildAbsenceMessageBatch, DEFAULT_ABSENCE_SMS_TEMPLATE, DEFAULT_ABSENCE_WHATSAPP_TEMPLATE, ensureTrilingualAbsenceTemplate, formatAbsenceDate } from "./messages";
import { parseAttendanceDate } from "./date";

function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function prepareAbsenceForSender(input: { senderId: string; sectionId: string; dateText: string; studentIds: string[]; channel: "SMS" | "WHATSAPP"; sendAgain?: boolean }) {
  const date = parseAttendanceDate(input.dateText);
  if (!date) throw new Error("Choose a valid attendance date");
  const ids = [...new Set(input.studentIds)].slice(0, 500);
  if (!ids.length) return [];
  const settingKeys = ["testMode", "testNumber", "collegeName", "department", "absenceSmsTemplateAllLanguages", "absenceWhatsappTemplateAllLanguages", "absenceMessagesAfter"];
  const [settingRows, attendance, sender, existing] = await Promise.all([
    db.setting.findMany({ where: { key: { in: settingKeys } }, select: { key: true, value: true } }),
    db.dailyAttendance.findUnique({
      where: { sectionId_date: { sectionId: input.sectionId, date } },
      select: {
        isHoliday: true,
        entries: {
          where: { status: "ABSENT", studentId: { in: ids } },
          select: { studentId: true, student: { select: { id: true, name: true, regNo: true, parentMobile: true, section: { select: { name: true } } } } },
        },
      },
    }),
    db.user.findUnique({ where: { id: input.senderId }, select: { id: true, name: true, mobile: true } }),
    db.preparedMessage.findMany({ where: { senderId: input.senderId, studentId: { in: ids }, channel: input.channel, kind: "ABSENCE" }, select: { id: true, studentId: true, status: true, sourceFingerprint: true } }),
  ]);
  if (!attendance || attendance.isHoliday) throw new Error("No absences are recorded for this day");
  if (!sender) throw new Error("Sender account not found");
  // Always prepare selected absentees. Duplicate protection belongs at send time,
  // so the sender can still review or regenerate a message that was already opened.
  const students = attendance.entries.map(row => row.student);
  const settings = Object.fromEntries(settingRows.map(row => [row.key, row.value]));
  const testMode = settings.testMode !== "false";
  const template = input.channel === "SMS"
    ? ensureTrilingualAbsenceTemplate(settings.absenceSmsTemplateAllLanguages || settings.absenceSmsTemplate, DEFAULT_ABSENCE_SMS_TEMPLATE)
    : ensureTrilingualAbsenceTemplate(settings.absenceWhatsappTemplateAllLanguages || settings.absenceWhatsappTemplate, DEFAULT_ABSENCE_WHATSAPP_TEMPLATE);
  const priorByStudent = new Map(existing.map(row => [row.studentId, row]));
  const writes: Array<{ id: string; studentId: string; senderId: string; channel: "SMS" | "WHATSAPP"; kind: "ABSENCE"; status: "READY" | "MISSING_NUMBER"; toNumber: string | null; text: string; listDate: Date; sourceFingerprint: string }> = [];
  const studentsToRender = students.map(student => ({
    student,
    toNumber: normalizePreparedNumber(student.parentMobile),
    values: { studentName: student.name, regNo: student.regNo, section: student.section.name, date: formatAbsenceDate(date, "en-GB"), dateHi: formatAbsenceDate(date, "hi-IN"), dateMr: formatAbsenceDate(date, "mr-IN"), senderName: sender.name, senderMobile: sender.mobile || "", department: settings.department || "Department", collegeName: settings.collegeName || "College" },
  }));
  const rendered = buildAbsenceMessageBatch(template, studentsToRender.map(row => row.values), input.channel, testMode);
  studentsToRender.forEach(({ student, toNumber, values }, index) => {
    const sourceFingerprint = fingerprint({ student: { ...values, parentMobile: student.parentMobile }, template, channel: input.channel, date: date.toISOString(), testMode, testNumber: settings.testNumber });
    const prior = priorByStudent.get(student.id);
    if (canReusePreparedMessage(prior, sourceFingerprint)) return;
    writes.push({ id: prior?.id || randomUUID(), studentId: student.id, senderId: sender.id, channel: input.channel, kind: "ABSENCE", status: toNumber ? "READY" : "MISSING_NUMBER", toNumber, text: rendered[index], listDate: date, sourceFingerprint });
  });
  if (writes.length) {
    const priorIds = writes.map(row => priorByStudent.get(row.studentId)?.id).filter((id): id is string => Boolean(id));
    if (priorIds.length) await db.preparedMessage.deleteMany({ where: { id: { in: priorIds } } });
    await db.preparedMessage.createMany({ data: writes });
  }
  return students.map(student => student.id);
}
