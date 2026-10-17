import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ABSENCE_DUPLICATE_STATUSES } from "@/features/daily-attendance/messages";
import { prepareAbsenceForSender } from "@/features/daily-attendance/preparation";
import { canViewDailySection } from "@/features/daily-attendance/access";
import { parseAttendanceDate } from "@/features/daily-attendance/date";

export const dynamic = "force-dynamic";
const schema = z.object({ sectionId: z.string().min(1), date: z.string(), channel: z.enum(["SMS", "WHATSAPP"]), sendAgain: z.boolean().default(false), overrideTime: z.boolean().default(false) });

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const sectionId = user.role === "TEACHER" ? user.sectionId || "" : params.get("sectionId") || "";
  const date = parseAttendanceDate(params.get("date") || "");
  if (!date || !canViewDailySection(user, sectionId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.messageLog.findMany({ where: { kind: "ABSENCE", listDate: date, student: { sectionId } }, select: { studentId: true, channel: true, status: true, createdAt: true } });
  return NextResponse.json({ statuses: rows });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "TEACHER" && !user.canSend) return NextResponse.json({ error: "Sending is disabled for your account" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { sectionId, channel, sendAgain, overrideTime } = parsed.data;
  const date = parseAttendanceDate(parsed.data.date);
  if (!date || !canViewDailySection(user, sectionId) || !await db.section.findUnique({ where: { id: sectionId }, select: { id: true } })) return NextResponse.json({ error: "Choose an authorized section and date" }, { status: 400 });
  const settingRows = await db.setting.findMany({ where: { key: { in: ["absenceMessagesAfter", "testMode", "testNumber"] } }, select: { key: true, value: true } });
  const settings = Object.fromEntries(settingRows.map(row => [row.key, row.value]));
  if (user.role !== "HOD" && settings.absenceMessagesAfter && !overrideTime) {
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    if (now < settings.absenceMessagesAfter) return NextResponse.json({ error: `Available after ${settings.absenceMessagesAfter}` }, { status: 403 });
  }
  const attendance = await db.dailyAttendance.findUnique({ where: { sectionId_date: { sectionId, date } }, select: { isHoliday: true, entries: { where: { status: "ABSENT" }, select: { studentId: true, student: { select: { name: true, regNo: true } } } } } });
  if (!attendance || attendance.isHoliday) return NextResponse.json({ error: "No absences are recorded for this day" }, { status: 400 });
  const studentIds = attendance.entries.map(row => row.studentId);
  const already = sendAgain ? [] : await db.messageLog.findMany({ where: { kind: "ABSENCE", channel, listDate: date, studentId: { in: studentIds }, status: { in: [...ABSENCE_DUPLICATE_STATUSES] } }, select: { studentId: true } });
  const alreadyIds = new Set(already.map(row => row.studentId));
  const eligibleIds = studentIds;
  await prepareAbsenceForSender({ senderId: user.id, sectionId, dateText: parsed.data.date, studentIds: eligibleIds, channel, sendAgain });
  const prepared = eligibleIds.length ? await db.preparedMessage.findMany({ where: { senderId: user.id, kind: "ABSENCE", channel, listDate: date, studentId: { in: eligibleIds } }, select: { id: true, studentId: true, status: true, toNumber: true } }) : [];
  return NextResponse.json({ preparedIds: prepared.filter(row => row.status === "READY").map(row => row.id), excluded: prepared.filter(row => row.status === "MISSING_NUMBER").map(row => { const student = attendance.entries.find(item => item.studentId === row.studentId)!.student; return { name: student.name, regNo: student.regNo, reason: "Missing or invalid parent number" }; }), alreadySent: attendance.entries.filter(row => alreadyIds.has(row.studentId)).map(row => row.student), testMode: settings.testMode !== "false", count: prepared.filter(row => row.status === "READY").length });
}
