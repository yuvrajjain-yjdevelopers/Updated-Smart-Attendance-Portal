import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessSendSession, connectionIsConfirmed, nextPendingIndex, pauseForSetup, queueCursorAtSavedIndex, resumeAfterSetup } from "@/lib/sendSessions";
import { DEFAULT_ATTENDANCE_THRESHOLD, attendanceSourceLabel, getEffectiveAttendance, getStatus } from "@/lib/attendance";

type Context = { params: Promise<{ id: string }> };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CONFIRM") }),
  z.object({ action: z.literal("OPEN_ANYWAY") }),
  z.object({ action: z.literal("NOT_WORKING") }),
  z.object({ action: z.literal("DISCARD") }),
  z.object({ action: z.literal("PROGRESS"), logId: z.string(), status: z.enum(["OPENED", "SENT_BY_USER", "SKIPPED", "FAILED"]), mode: z.string().max(40), advance: z.boolean().optional().default(false) }),
]);
async function loadOwnedSession(id: string, user: NonNullable<Awaited<ReturnType<typeof currentUser>>>) {
  const access = await db.sendSession.findUnique({ where: { id }, select: { userId: true, sectionId: true, kind: true } });
  if (!access || !canAccessSendSession(user, access)) return null;
  const student = access.kind === "ABSENCE"
    ? { id: true, name: true, regNo: true, sectionId: true }
    : { id: true, name: true, regNo: true, sectionId: true, avgAtt: true, totalAttendancePct: true, lastListDate: true, isDetained: true, lowSubjectCount: true, detainedSubjects: true };
  return db.sendSession.findUnique({ where: { id }, include: { section: { select: { name: true } }, items: { orderBy: { order: "asc" }, include: { student: { select: student }, messageLog: true, preparedMessage: true } } } });
}

function formatSession(session: NonNullable<Awaited<ReturnType<typeof loadOwnedSession>>>, threshold = DEFAULT_ATTENDANCE_THRESHOLD) {
  const queue = session.items.filter(item => item.status !== "EXCLUDED" && item.messageLog).map(item => ({
    id: item.messageLog!.id,
    preparedId: item.preparedMessageId || "",
    name: item.student.name,
    regNo: item.student.regNo,
    avgAtt: session.kind === "ABSENCE" ? null : getEffectiveAttendance(item.student as Parameters<typeof getEffectiveAttendance>[0]).pct,
    attendanceSourceLabel: session.kind === "ABSENCE" ? "" : attendanceSourceLabel(getEffectiveAttendance(item.student as Parameters<typeof getEffectiveAttendance>[0])),
    statusLabel: session.kind === "ABSENCE" ? "Absent" : getStatus(item.student as Parameters<typeof getStatus>[0], threshold),
    section: session.section.name,
    toNumber: item.messageLog!.toNumber,
    text: item.messageLog!.text,
    channel: item.messageLog!.channel,
    status: item.status,
  }));
  const currentOrder = session.currentIndex;
  const currentQueueIndex = queueCursorAtSavedIndex(session.items.map(item => item.status), currentOrder);
  const done = session.items.filter(item => ["SENT_BY_USER", "SKIPPED", "FAILED", "EXCLUDED"].includes(item.status)).length;
  return { session: { id: session.id, sectionId: session.sectionId, sectionName: session.section.name, channel: session.channel, kind: session.kind, date: session.items.find(item => item.messageLog?.listDate)?.messageLog?.listDate?.toISOString().slice(0, 10) || null, mobileLinkMode: session.mobileLinkMode, status: session.status, currentIndex: session.currentIndex, testMode: session.testMode, total: session.items.length, done }, queue, currentQueueIndex };
}

export async function GET(_: Request, { params }: Context) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const session = await loadOwnedSession(id, user);
  if (!session) return NextResponse.json({ error: "Send session not found" }, { status: 404 });
  const kind = session.channel === "WHATSAPP" ? "WHATSAPP_WEB" : "MOBILE_LINK";
  const [connection, settings] = await Promise.all([db.messagingConnection.findUnique({ where: { userId_kind: { userId: user.id, kind } } }), db.setting.findMany({ where: { key: { in: ["attendanceThreshold", "threshold"] } }, select: { key: true, value: true } })]);
  const settingValues = Object.fromEntries(settings.map(row => [row.key, row.value]));
  const threshold = Number(settingValues.attendanceThreshold || settingValues.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  return NextResponse.json({ ...formatSession(session, threshold), connectionKind: kind, connectionConfirmed: connectionIsConfirmed(connection?.confirmedAt) });
}

export async function PATCH(request: Request, { params }: Context) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid send-session action" }, { status: 400 });
  const session = await loadOwnedSession(id, user);
  if (!session) return NextResponse.json({ error: "Send session not found" }, { status: 404 });
  const kind = session.channel === "WHATSAPP" ? "WHATSAPP_WEB" : "MOBILE_LINK";
  const action = parsed.data.action;
  if (action === "DISCARD") {
    await db.sendSession.update({ where: { id }, data: { status: "CANCELLED", activeKey: null } });
    return NextResponse.json({ ok: true, status: "CANCELLED" });
  }
  if (action === "NOT_WORKING") {
    await db.$transaction([
      db.messagingConnection.upsert({ where: { userId_kind: { userId: user.id, kind } }, create: { userId: user.id, kind, confirmedAt: null }, update: { confirmedAt: null } }),
      db.sendSession.update({ where: { id }, data: pauseForSetup(session.currentIndex) }),
    ]);
    return NextResponse.json({ ok: true, status: "PAUSED_SETUP", currentIndex: session.currentIndex });
  }
  if (action === "CONFIRM") {
    await db.messagingConnection.upsert({ where: { userId_kind: { userId: user.id, kind } }, create: { userId: user.id, kind, confirmedAt: new Date() }, update: { confirmedAt: new Date() } });
  }
  if (action === "CONFIRM" || action === "OPEN_ANYWAY") {
    await db.sendSession.update({ where: { id }, data: resumeAfterSetup(session.currentIndex) });
    const refreshed = await loadOwnedSession(id, user);
    return NextResponse.json({ ok: true, ...formatSession(refreshed!) });
  }
  const progress = parsed.data;
  if (progress.action !== "PROGRESS") return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const item = session.items.find(row => row.messageLogId === progress.logId);
  if (!item || !item.messageLog) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  const updatedItems = session.items.map(row => row.id === item.id ? { ...row, status: progress.status } : row);
  const statuses = updatedItems.map(row => row.status);
  const nextIndex = progress.advance ? nextPendingIndex(statuses, session.currentIndex + 1) : session.currentIndex;
  const completed = nextIndex >= updatedItems.length;
  await db.$transaction(async tx => {
    const mode = session.channel === "SMS" ? session.mobileLinkMode.toLowerCase().replaceAll("_", "-") : progress.mode;
    await tx.messageLog.update({ where: { id: progress.logId }, data: { status: progress.status, mode } });
    await tx.sendSessionItem.update({ where: { id: item.id }, data: { status: progress.status } });
    if (progress.status === "SENT_BY_USER" || progress.status === "SKIPPED") {
      await tx.preparedMessage.updateMany({ where: { senderId: user.id, studentId: item.studentId, channel: session.channel, kind: session.kind }, data: { status: progress.status === "SENT_BY_USER" ? "SENT" : "SKIPPED" } });
    }
    await tx.sendSession.update({ where: { id }, data: { currentIndex: nextIndex, status: completed ? "COMPLETED" : "IN_PROGRESS", activeKey: completed ? null : session.activeKey } });
  });
  return NextResponse.json({ ok: true, status: progress.status, currentIndex: nextIndex, sessionStatus: completed ? "COMPLETED" : "IN_PROGRESS" });
}
