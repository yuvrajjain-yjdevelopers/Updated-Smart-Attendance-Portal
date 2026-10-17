import { db } from "@/lib/db";
import { createHash } from "node:crypto";
import { compileTemplate, getSmsMetrics, getTrilingualSmsTemplate, getTrilingualWhatsAppTemplate, normalizeSmsText, sanitizeSmsTemplate, toAsciiSms } from "@/lib/messageTemplates";
import { normalizeIndianMobile } from "@/lib/phone";
import { parseDetainedSubjects } from "@/lib/detentionSubjects";
import { DEFAULT_ATTENDANCE_THRESHOLD, formatAttendance, getEffectiveAttendance, getStatus } from "@/lib/attendance";

export function normalizePreparedNumber(value: string): string | null {
  try { return `91${normalizeIndianMobile(value)}`; } catch { return null; }
}

type TemplateValues = Record<string, string | number | null | undefined>;
type TemplateRenderer = (values: TemplateValues) => string;
export type PreparedTextInput = { template: string; studentName: string; regNo: string; section: string; avg: number | null; subjects: string[]; date: Date; senderName: string; senderMobile: string; collegeName: string; department: string; testMode: boolean; channel?: "SMS" | "WHATSAPP" };
export function buildPreparedText(input: PreparedTextInput, renderer?: TemplateRenderer) {
  const template = input.channel === "SMS" ? sanitizeSmsTemplate(input.template) : input.template;
  const activeRenderer = template === input.template && renderer ? renderer : compileTemplate(template);
  const rendered = activeRenderer({
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
  const intro = `Dear Parent, ${input.studentName} (Reg ${input.regNo}) has ${formatAttendance(input.avg) ?? ""}% average attendance, below 75%. Please tell your child to attend regular classes.`;
  const ending = ` Contact ${input.senderName} (${input.senderMobile}). -${input.collegeName}`;
  const compact = toAsciiSms(`${testPrefix}${intro}${ending}`);
  return compact.length <= 306 ? compact : `${compact.slice(0, 303)}...`;
}

export function buildPreparedTextBatch(inputs: PreparedTextInput[]) {
  const renderers = new Map<string, TemplateRenderer>();
  return inputs.map(input => {
    const template = input.channel === "SMS" ? sanitizeSmsTemplate(input.template) : input.template;
    let renderer = renderers.get(template);
    if (!renderer) { renderer = compileTemplate(template); renderers.set(template, renderer); }
    return buildPreparedText({ ...input, template }, renderer);
  });
}

function sourceFingerprint(values: unknown) { return createHash("sha256").update(JSON.stringify(values)).digest("hex"); }
export function canReusePreparedMessage(prior: { status: string; sourceFingerprint: string | null } | undefined, fingerprint: string) {
  return Boolean(prior && prior.status !== "SENT" && prior.status !== "OPENED" && prior.sourceFingerprint === fingerprint);
}

/** Regenerate only missing or stale messages for the selected roster rows. */
export async function prepareSelectedForSender(input: { senderId: string; sectionId: string; studentIds: string[]; channel: "SMS" | "WHATSAPP" }, onProgress?: (progress: { processed: number; total: number; prepared: number }) => void | Promise<void>) {
  const ids = [...new Set(input.studentIds)].slice(0, 500);
  if (!ids.length) return;
  const preparationKeys = ["attendanceThreshold", "threshold", "smsTemplateAllLanguages", "whatsappTemplateAllLanguages", "testMode", "testNumber", "collegeName", "department"];
  const [settingRows, students, sender, existing] = await Promise.all([
    db.setting.findMany({ where: { key: { in: preparationKeys } }, select: { key: true, value: true } }),
    db.student.findMany({ where: { id: { in: ids }, sectionId: input.sectionId }, select: { id: true, name: true, regNo: true, parentMobile: true, avgAtt: true, totalAttendancePct: true, lastListDate: true, isDetained: true, lowSubjectCount: true, detainedSubjects: true, section: { select: { name: true } } } }),
    db.user.findUnique({ where: { id: input.senderId }, select: { id: true, name: true, mobile: true } }),
    db.preparedMessage.findMany({ where: { senderId: input.senderId, studentId: { in: ids }, channel: input.channel, kind: "DETENTION" }, select: { id: true, studentId: true, status: true, sourceFingerprint: true } }),
  ]);
  if (!sender) throw new Error("Sender account not found.");
  const settings = Object.fromEntries(settingRows.map(row => [row.key, row.value]));
  const threshold = Number(settings.attendanceThreshold || settings.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  const template = input.channel === "SMS" ? getTrilingualSmsTemplate(settings) : getTrilingualWhatsAppTemplate(settings);
  const priorByStudent = new Map(existing.map(row => [row.studentId, row]));
  const staleIds: string[] = [];
  const candidates: Array<{ studentId: string; senderId: string; channel: "SMS" | "WHATSAPP"; status: "READY" | "MISSING_NUMBER"; toNumber: string | null; listDate: Date | null; sourceFingerprint: string; text: string }> = [];
  const renderer = compileTemplate(template);
  let prepared = 0;
  for (const [index, student] of students.entries()) {
    const prior = priorByStudent.get(student.id);
    if (getStatus(student, threshold) !== "Detained") {
      if (prior) staleIds.push(prior.id);
      if (onProgress && (index % 4 === 3 || index === students.length - 1)) await onProgress({ processed: index + 1, total: students.length, prepared });
      continue;
    }
    const attendance = getEffectiveAttendance(student);
    const subjects = attendance.source === "LIST" ? parseDetainedSubjects(student.detainedSubjects).map(subject => `${subject.code} - ${subject.name}`) : [];
    const listDate = attendance.listDate ? new Date(attendance.listDate) : null;
    const toNumber = normalizePreparedNumber(student.parentMobile);
    const textInput: PreparedTextInput = { template, studentName: student.name, regNo: student.regNo, section: student.section.name, avg: attendance.pct, subjects, date: listDate || new Date(0), senderName: sender.name, senderMobile: sender.mobile || "", collegeName: settings.collegeName || "College", department: settings.department || "Department", testMode: settings.testMode !== "false", channel: input.channel };
    const fingerprint = sourceFingerprint({ student: { name: student.name, regNo: student.regNo, parentMobile: student.parentMobile, avg: attendance.pct, subjects, listDate, section: student.section.name }, sender: { name: sender.name, mobile: sender.mobile }, template, testMode: settings.testMode !== "false", testNumber: settings.testNumber });
    if (canReusePreparedMessage(prior, fingerprint)) {
      prepared += 1;
    } else {
      if (prior) staleIds.push(prior.id);
      candidates.push({ studentId: student.id, senderId: sender.id, channel: input.channel, status: toNumber ? "READY" : "MISSING_NUMBER", toNumber, listDate, sourceFingerprint: fingerprint, text: buildPreparedText(textInput, renderer) });
      prepared += 1;
    }
    if (onProgress && (index % 4 === 3 || index === students.length - 1)) await onProgress({ processed: index + 1, total: students.length, prepared });
  }
  if (onProgress && students.length === 0) await onProgress({ processed: 0, total: 0, prepared: 0 });
  if (staleIds.length) await db.preparedMessage.deleteMany({ where: { id: { in: staleIds } } });
  const creates = candidates.map(candidate => ({ studentId: candidate.studentId, senderId: candidate.senderId, channel: candidate.channel, status: candidate.status, toNumber: candidate.toNumber, text: candidate.text, listDate: candidate.listDate, sourceFingerprint: candidate.sourceFingerprint }));
  if (creates.length) await db.preparedMessage.createMany({ data: creates });
}

export async function regeneratePreparedMessages(sectionId?: string, senderOnlyId?: string) {
  const [settingRows, allStudents, senders] = await Promise.all([
    db.setting.findMany({ select: { key: true, value: true } }),
    db.student.findMany({ where: sectionId ? { sectionId } : {}, include: { section: true } }),
    db.user.findMany({ where: { active: true, ...(senderOnlyId ? { id: senderOnlyId } : {}), OR: [{ role: "HOD" }, { role: "TEACHER", canSend: true, sectionId: sectionId ? sectionId : { not: null } }] }, select: { id: true, name: true, mobile: true, role: true, sectionId: true } }),
  ]);
  const settings = Object.fromEntries(settingRows.map(x => [x.key, x.value]));
  const threshold = Number(settings.attendanceThreshold || settings.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  const renderers = { SMS: compileTemplate(getTrilingualSmsTemplate(settings)), WHATSAPP: compileTemplate(getTrilingualWhatsAppTemplate(settings)) };
  const eligibleStudents = allStudents.filter(student => ["Detained"].includes(getStatus(student, threshold)));
  const senderIds = senders.map(sender => sender.id);
  const existingRows = senderIds.length ? await db.preparedMessage.findMany({
    where: { senderId: { in: senderIds }, kind: "DETENTION", ...(sectionId ? { student: { sectionId } } : {}) },
    select: { id: true, studentId: true, senderId: true, channel: true, status: true, toNumber: true, text: true, listDate: true, sourceFingerprint: true },
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
        const fingerprint = sourceFingerprint({ student: { name: student.name, regNo: student.regNo, parentMobile: student.parentMobile, avg: effective.pct, subjects, listDate, section: student.section.name }, sender: { name: sender.name, mobile: sender.mobile }, template, testMode: settings.testMode !== "false", testNumber: settings.testNumber });
        const text = buildPreparedText({ template, studentName: student.name, regNo: student.regNo, section: student.section.name, avg: effective.pct, subjects, date: listDate || new Date(0), senderName: sender.name, senderMobile: sender.mobile || "", collegeName: settings.collegeName || "College", department: settings.department || "Department", testMode: settings.testMode !== "false", channel }, renderers[channel]);
        const compoundKey = `${student.id}:${sender.id}:${channel}`;
        desiredKeys.add(compoundKey);
        const previous = existingByKey.get(compoundKey);
        const status = previous?.status === "SENT" || previous?.status === "OPENED" ? previous.status : number ? "READY" : "MISSING_NUMBER";
        const previousListDate = previous?.listDate?.getTime() ?? null;
        const nextListDate = listDate?.getTime() ?? null;
        const changed = !previous || previous.status !== status || previous.toNumber !== number || previous.text !== text || previousListDate !== nextListDate || previous.sourceFingerprint !== fingerprint;
        if (!changed) continue;
        const key = { studentId_senderId_channel_kind: { studentId: student.id, senderId: sender.id, channel, kind: "DETENTION" } };
        writes.push(db.preparedMessage.upsert({ where: key, create: { studentId: student.id, senderId: sender.id, channel, kind: "DETENTION", status, toNumber: number, text, listDate, sourceFingerprint: fingerprint }, update: { status, toNumber: number, text, listDate, sourceFingerprint: fingerprint } }));
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
    db.preparedMessage.findMany({ where: { senderId, kind: "DETENTION", ...(sectionId ? { student: { sectionId } } : {}) }, select: { studentId: true, channel: true } }),
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
