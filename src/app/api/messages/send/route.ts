import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSendForSection, resolveRecipient } from "@/lib/sendCenter";
import { DEFAULT_ATTENDANCE_THRESHOLD, getEffectiveAttendance, getStatus } from "@/lib/attendance";
import { ACTIVE_SESSION_STATUSES, connectionIsConfirmed, initialSendState } from "@/lib/sendSessions";
import { ABSENCE_DUPLICATE_STATUSES } from "@/features/daily-attendance/messages";

export const dynamic = "force-dynamic";
const schema = z.object({
  preparedIds: z.array(z.string()).min(1).max(500),
  kind: z.enum(["DETENTION", "ABSENCE"]).default("DETENTION"),
  sendAgain: z.boolean().optional().default(false),
  overrideTime: z.boolean().optional().default(false),
  channel: z.enum(["SMS", "WHATSAPP"]),
  mode: z.string().max(40).optional().default("sms-link"),
  excludedIds: z.array(z.string()).max(500).optional().default([]),
});

export async function POST(request: Request) {
  const sender = await currentUser();
  if (!sender) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (sender.role === "TEACHER" && !sender.canSend) return NextResponse.json({ error: "Sending is disabled for your account" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const ids = [...new Set(parsed.data.preparedIds)];
  const studentSelect = parsed.data.kind === "ABSENCE"
    ? { id: true, name: true, regNo: true, sectionId: true, parentMobile: true, section: { select: { name: true } } }
    : { id: true, name: true, regNo: true, sectionId: true, parentMobile: true, avgAtt: true, totalAttendancePct: true, lastListDate: true, isDetained: true, lowSubjectCount: true, detainedSubjects: true, section: { select: { name: true } } };
  const messages = await db.preparedMessage.findMany({ where: { id: { in: ids }, senderId: sender.id, channel: parsed.data.channel, kind: parsed.data.kind }, include: { student: { select: studentSelect } } });
  if (messages.length !== ids.length) return NextResponse.json({ error: "Prepared messages must belong to your account" }, { status: 403 });
  if (messages.some(message => message.status === "SENT" || message.status === "OPENED") && !(parsed.data.kind === "ABSENCE" && parsed.data.sendAgain)) return NextResponse.json({ error: "This preview is out of date. Prepare the selected messages again before starting a new send." }, { status: 409 });
  if (messages.some(message => !canSendForSection(sender.role, sender.canSend, sender.sectionId, message.student.sectionId))) return NextResponse.json({ error: "One or more students are outside your permitted section" }, { status: 403 });
  const sectionIds = [...new Set(messages.map(message => message.student.sectionId))];
  if (sectionIds.length !== 1) return NextResponse.json({ error: "Start one send session per section." }, { status: 400 });
  const sectionId = sectionIds[0];
  const orderedMessages = ids.map(id => messages.find(message => message.id === id)!).filter(Boolean);
  const settings = Object.fromEntries((await db.setting.findMany({ where: { key: { in: ["testMode", "testNumber", "attendanceThreshold", "threshold", "absenceMessagesAfter"] } } })).map(row => [row.key, row.value]));
  if (parsed.data.kind === "ABSENCE" && sender.role !== "HOD" && settings.absenceMessagesAfter && !parsed.data.overrideTime) {
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    if (now < settings.absenceMessagesAfter) return NextResponse.json({ error: `Available after ${settings.absenceMessagesAfter}` }, { status: 403 });
  }
  const threshold = Number(settings.attendanceThreshold || settings.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  const testMode = settings.testMode !== "false";
  const testDestination = testMode ? resolveRecipient(null, true, settings.testNumber || "") : null;
  if (testMode && !testDestination) return NextResponse.json({ error: "Set a valid test number in Settings before sending in test mode" }, { status: 400 });
  const manuallyExcluded = new Set(parsed.data.excludedIds);
  const absenceStudentIds = parsed.data.kind === "ABSENCE" ? await db.dailyAttendanceEntry.findMany({ where: { dailyAttendance: { sectionId, date: orderedMessages[0].listDate || new Date(0), isHoliday: false }, studentId: { in: orderedMessages.map(message => message.studentId) }, status: "ABSENT" }, select: { studentId: true } }) : [];
  const absenceSet = new Set(absenceStudentIds.map(row => row.studentId));
  const duplicateAbsences = parsed.data.kind === "ABSENCE" && !parsed.data.sendAgain ? await db.messageLog.findMany({ where: { kind: "ABSENCE", channel: parsed.data.channel, listDate: orderedMessages[0].listDate, studentId: { in: orderedMessages.map(message => message.studentId) }, status: { in: [...ABSENCE_DUPLICATE_STATUSES] } }, select: { studentId: true } }) : [];
  const duplicateSet = new Set(duplicateAbsences.map(row => row.studentId));
  const entries = orderedMessages.map(message => {
    const reason = message.status === "MISSING_NUMBER" ? "Missing or invalid parent number" : parsed.data.kind === "ABSENCE" ? !absenceSet.has(message.studentId) ? "Student is no longer marked absent for this date" : duplicateSet.has(message.studentId) ? "Already messaged for this date and channel" : null : getStatus(message.student as Parameters<typeof getStatus>[0], threshold) !== "Detained" ? "Student is no longer below the attendance threshold" : null;
    const toNumber = reason ? null : resolveRecipient(message.toNumber, testMode, settings.testNumber || "");
    return { message, reason: reason || (!toNumber ? "Missing or invalid parent number" : manuallyExcluded.has(message.id) ? "Excluded by sender" : null), toNumber };
  });
  const queued = entries.filter(entry => !entry.reason && entry.toNumber);
  if (!queued.length && duplicateSet.size) return NextResponse.json({ error: "These students already have a message opened or sent for this date. Select ‘Send again to students already messaged’ to continue." }, { status: 409 });
  if (!queued.length) return NextResponse.json({ error: "No selected students are ready to send." }, { status: 400 });

  const active = await db.sendSession.findFirst({ where: { userId: sender.id, channel: parsed.data.channel, kind: parsed.data.kind, status: { in: [...ACTIVE_SESSION_STATUSES] } }, include: { section: { select: { name: true } } }, orderBy: { updatedAt: "desc" } });
  if (active) return NextResponse.json({ error: "You already have an unfinished send session.", activeSession: { id: active.id, sectionId: active.sectionId, sectionName: active.section.name, channel: active.channel } }, { status: 409 });

  const connectionKind = parsed.data.channel === "WHATSAPP" ? "WHATSAPP_WEB" : "MOBILE_LINK";
  const connection = await db.messagingConnection.findUnique({ where: { userId_kind: { userId: sender.id, kind: connectionKind } } });
  const connectionConfirmed = connectionIsConfirmed(connection?.confirmedAt);
  let created: { sessionId: string; logIds: Map<string, string> };
  try {
   created = await db.$transaction(async tx => {
    const activeKey = parsed.data.kind === "DETENTION" ? `${sender.id}:${parsed.data.channel}` : `${sender.id}:${parsed.data.channel}:ABSENCE`;
    const session = await tx.sendSession.create({ data: { userId: sender.id, sectionId, channel: parsed.data.channel, kind: parsed.data.kind, mobileLinkMode: sender.mobileLinkMode, activeKey, status: connectionConfirmed ? "IN_PROGRESS" : "PREPARED", currentIndex: 0, testMode } });
    const batch = await tx.messageBatch.create({ data: { sectionId, sentById: sender.id, senderName: sender.name, channels: parsed.data.channel, total: queued.length, testMode } });
    const logIds = new Map<string, string>();
    const logs: Prisma.MessageLogCreateManyInput[] = [];
    const sessionItems: Prisma.SendSessionItemCreateManyInput[] = [];
    for (const [order, entry] of entries.entries()) {
      const { message } = entry;
      if (entry.reason || !entry.toNumber) {
        sessionItems.push({ sessionId: session.id, studentId: message.studentId, kind: parsed.data.kind, preparedMessageId: message.id, order, status: "EXCLUDED" });
        continue;
      }
      const logId = randomUUID();
      logs.push({ id: logId, batchId: batch.id, studentId: message.studentId, sentById: sender.id, senderName: sender.name, channel: message.channel, kind: parsed.data.kind, status: "QUEUED", mode: "pending", listDate: message.listDate, toNumber: entry.toNumber, text: message.text });
      sessionItems.push({ sessionId: session.id, studentId: message.studentId, kind: parsed.data.kind, preparedMessageId: message.id, messageLogId: logId, order, status: "PENDING" });
      logIds.set(message.id, logId);
    }
    if (logs.length) await tx.messageLog.createMany({ data: logs });
    if (sessionItems.length) await tx.sendSessionItem.createMany({ data: sessionItems });
    const initialState = initialSendState(connectionConfirmed, entries.map(entry => entry.reason ? "EXCLUDED" : "PENDING"));
    await tx.sendSession.update({ where: { id: session.id }, data: initialState });
    return { sessionId: session.id, logIds };
   }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const activeKey = parsed.data.kind === "DETENTION" ? `${sender.id}:${parsed.data.channel}` : `${sender.id}:${parsed.data.channel}:ABSENCE`;
      const existing = await db.sendSession.findUnique({ where: { activeKey }, include: { section: { select: { name: true } } } });
      return NextResponse.json({ error: "You already have an unfinished send session.", activeSession: existing ? { id: existing.id, sectionId: existing.sectionId, sectionName: existing.section.name, channel: existing.channel } : null }, { status: 409 });
    }
    throw error;
  }
  const queue = queued.map(({ message, toNumber }) => ({ id: created.logIds.get(message.id)!, preparedId: message.id, name: message.student.name, regNo: message.student.regNo, avgAtt: parsed.data.kind === "ABSENCE" ? null : getEffectiveAttendance(message.student as Parameters<typeof getEffectiveAttendance>[0]).pct, statusLabel: parsed.data.kind === "ABSENCE" ? "Absent" : getStatus(message.student as Parameters<typeof getStatus>[0], threshold), section: message.student.section.name, toNumber: toNumber!, text: message.text, channel: message.channel, status: "PENDING" }));
  const initialIndex = initialSendState(connectionConfirmed, entries.map(entry => entry.reason ? "EXCLUDED" : "PENDING")).currentIndex;
  const firstQueueIndex = entries.slice(0, initialIndex).filter(entry => !entry.reason).length;
  return NextResponse.json({ sessionId: created.sessionId, kind: parsed.data.kind, queue, testMode, testNumber: testDestination || settings.testNumber || "", excluded: entries.filter(entry => entry.reason).map(entry => ({ id: entry.message.id, name: entry.message.student.name, reason: entry.reason })), connectionKind, connectionConfirmed, mobileLinkMode: sender.mobileLinkMode, currentIndex: firstQueueIndex });
}
