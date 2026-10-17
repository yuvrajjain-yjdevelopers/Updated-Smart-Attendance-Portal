import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessDailySection, canEditDailyDate, canViewDailySection } from "@/features/daily-attendance/access";
import { parseAttendanceDate, todayInIndia } from "@/features/daily-attendance/date";

export const dynamic = "force-dynamic";
const schema = z.object({ sectionId: z.string().min(1), date: z.string(), isHoliday: z.boolean().default(false), entries: z.array(z.object({ studentId: z.string(), status: z.enum(["PRESENT", "ABSENT"]) })).max(2000) });

async function allowed(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>, sectionId: string, forMarking = false) {
  if (forMarking ? !canAccessDailySection(user, sectionId) : !canViewDailySection(user, sectionId)) return false;
  return Boolean(await db.section.findUnique({ where: { id: sectionId }, select: { id: true } }));
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const dateText = params.get("date") || todayInIndia();
  const date = parseAttendanceDate(dateText);
  if (!date || dateText > todayInIndia()) return NextResponse.json({ error: "Choose a valid date no later than today" }, { status: 400 });
  const rangeStart = params.get("from");
  const rangeEnd = params.get("to");
  if ((rangeStart || rangeEnd) && (!parseAttendanceDate(rangeStart || "") || !parseAttendanceDate(rangeEnd || "") || rangeStart! > rangeEnd! || rangeEnd! > todayInIndia())) return NextResponse.json({ error: "Choose a valid past date range" }, { status: 400 });
  const sectionId = user.role === "TEACHER" ? user.sectionId : params.get("sectionId");
  if (sectionId) {
    if (!await allowed(user, sectionId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const [section, students, record, deliverySettings] = await Promise.all([
      db.section.findUnique({ where: { id: sectionId }, select: { id: true, name: true } }),
      db.student.findMany({ where: { sectionId }, select: { id: true, regNo: true, name: true, parentMobile: true }, orderBy: [{ regNo: "asc" }, { name: "asc" }] }),
      db.dailyAttendance.findUnique({
        where: { sectionId_date: { sectionId, date } },
        include: {
          markedBy: { select: { name: true } },
          entries: { select: { studentId: true, status: true } },
          audits: { orderBy: { changedAt: "desc" } },
        },
      }),
      db.setting.findUnique({ where: { key: "absenceMessagesAfter" }, select: { value: true } }),
    ]);
    const [year, month] = dateText.slice(0, 7).split("-").map(Number);
    const fromDate = parseAttendanceDate(params.get("from") || `${dateText.slice(0, 7)}-01`) || new Date(Date.UTC(year, month - 1, 1));
    const toText = params.get("to");
    const toDate = toText ? parseAttendanceDate(toText) : new Date(Date.UTC(year, month, 1) - 1);
    const monthStart = fromDate;
    const monthEnd = toDate ? new Date(toDate.getTime() + 86_400_000) : new Date(Date.UTC(year, month, 1));
    const monthlyRows = await db.dailyAttendanceEntry.findMany({ where: { dailyAttendance: { sectionId, date: { gte: monthStart, lt: monthEnd }, isHoliday: false } }, select: { studentId: true, status: true, dailyAttendance: { select: { date: true } } } });
    const absenceCounts = new Map<string, number>();
    for (const row of monthlyRows) if (row.status === "ABSENT") absenceCounts.set(row.studentId, (absenceCounts.get(row.studentId) || 0) + 1);
    const daily = new Map<string, Array<{ studentId: string; status: string }>>();
    for (const row of monthlyRows) { const key = row.dailyAttendance.date.toISOString(); const dayEntries = daily.get(key) || []; dayEntries.push({ studentId: row.studentId, status: row.status }); daily.set(key, dayEntries); }
    const monthly = [...daily.entries()].map(([day, entries]) => ({ date: day, sectionId, entries }));
    return NextResponse.json({ section, date: dateText, availableAfter: deliverySettings?.value || "", students: students.map(student => ({ ...student, status: record?.entries.find(entry => entry.studentId === student.id)?.status || "PRESENT", absentDaysThisMonth: absenceCounts.get(student.id) || 0 })), record: record ? { isHoliday: record.isHoliday, submittedAt: record.submittedAt, updatedAt: record.updatedAt, markedBy: record.markedBy?.name || record.markedByName } : null, history: (record?.audits || []).map(audit => ({ id: audit.id, studentId: audit.studentId, field: audit.field, fromValue: audit.fromValue, toValue: audit.toValue, changedAt: audit.changedAt, changedBy: audit.changedByName })), monthly });
  }
  if (user.role !== "HOD") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sections = await db.section.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, dailyAttendances: { where: { date }, select: { isHoliday: true, submittedAt: true, markedByName: true, markedBy: { select: { name: true } }, entries: { select: { status: true } } } }, students: { select: { id: true, dailyAttendanceEntries: { where: { dailyAttendance: { date } }, select: { status: true } } } } } });
  const month = params.get("month");
  let monthly = null;
  if ((params.get("from") || params.get("to")) && parseAttendanceDate(params.get("from") || "") && parseAttendanceDate(params.get("to") || "")) {
    const from = parseAttendanceDate(params.get("from")!)!;
    const to = parseAttendanceDate(params.get("to")!)!;
    monthly = await db.dailyAttendance.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true, sectionId: true, isHoliday: true, entries: { select: { studentId: true, status: true } } }, orderBy: { date: "asc" } });
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, monthNumber] = month.split("-").map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));
    const rows = await db.dailyAttendance.findMany({ where: { date: { gte: start, lt: end } }, select: { date: true, sectionId: true, isHoliday: true, entries: { select: { studentId: true, status: true } } }, orderBy: { date: "asc" } });
    monthly = rows;
  }
  return NextResponse.json({ date: dateText, sections: sections.map(section => { const record = section.dailyAttendances[0]; const entries = record?.entries || []; return { id: section.id, name: section.name, markedBy: record?.markedBy?.name || record?.markedByName || null, submittedAt: record?.submittedAt || null, isHoliday: record?.isHoliday || false, present: entries.filter(entry => entry.status === "PRESENT").length, absent: entries.filter(entry => entry.status === "ABSENT").length, total: section.students.length }; }), monthly });
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "TEACHER" && !user.canMarkDailyAttendance) return NextResponse.json({ error: "Daily attendance marking is disabled for your account" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const date = parseAttendanceDate(input.date);
  if (!date || input.date > todayInIndia()) return NextResponse.json({ error: "Choose a valid date no later than today" }, { status: 400 });
  if (!await allowed(user, input.sectionId, true)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const settings = Object.fromEntries((await db.setting.findMany({ where: { key: { in: ["teacherDailyAttendanceEditWindowDays"] } } })).map(row => [row.key, row.value]));
  const windowDays = Math.max(0, Number(settings.teacherDailyAttendanceEditWindowDays || 1) || 0);
  if (!canEditDailyDate(user, input.date, windowDays, todayInIndia())) return NextResponse.json({ error: "You can edit only attendance within the permitted date window" }, { status: 403 });
  const students = await db.student.findMany({ where: { sectionId: input.sectionId }, select: { id: true } });
  if (new Set(input.entries.map(entry => entry.studentId)).size !== input.entries.length || input.entries.some(entry => !students.some(student => student.id === entry.studentId))) return NextResponse.json({ error: "Attendance contains duplicate or out-of-section students" }, { status: 400 });
  if (!input.isHoliday && input.entries.length !== students.length) return NextResponse.json({ error: "Submit one status for every student in the section" }, { status: 400 });
  const entries = input.isHoliday ? [] : input.entries;
  const now = new Date();
  const record = await db.$transaction(async tx => {
    const prior = await tx.dailyAttendance.findUnique({ where: { sectionId_date: { sectionId: input.sectionId, date } }, include: { entries: { select: { studentId: true, status: true } } } });
    const attendance = await tx.dailyAttendance.upsert({ where: { sectionId_date: { sectionId: input.sectionId, date } }, create: { sectionId: input.sectionId, date, markedById: user.id, markedByName: user.name, submittedAt: now, isHoliday: input.isHoliday }, update: { markedById: user.id, markedByName: user.name, submittedAt: now, isHoliday: input.isHoliday } });
    const before = new Map<string, string>((prior?.entries || []).map(entry => [entry.studentId, entry.status]));
    const after = new Map<string, string>(entries.map(entry => [entry.studentId, entry.status]));
    const changes: Prisma.DailyAttendanceAuditCreateManyInput[] = [...new Set([...before.keys(), ...after.keys()])].flatMap(studentId => { const from = before.get(studentId) || null; const to = after.get(studentId) || null; return from !== to ? [{ dailyAttendanceId: attendance.id, changedById: user.id, changedByName: user.name, studentId, field: "status", fromValue: from, toValue: to, changedAt: now }] : []; });
    if ((prior?.isHoliday || false) !== input.isHoliday) changes.push({ dailyAttendanceId: attendance.id, changedById: user.id, changedByName: user.name, studentId: null, field: "isHoliday", fromValue: String(prior?.isHoliday || false), toValue: String(input.isHoliday), changedAt: now });
    if (input.isHoliday) {
      await tx.dailyAttendanceEntry.deleteMany({ where: { dailyAttendanceId: attendance.id } });
    } else {
      const existingStudentIds = new Set(before.keys());
      const presentIds = entries.filter(entry => entry.status === "PRESENT").map(entry => entry.studentId);
      const absentIds = entries.filter(entry => entry.status === "ABSENT").map(entry => entry.studentId);
      await Promise.all([
        presentIds.length ? tx.dailyAttendanceEntry.updateMany({ where: { dailyAttendanceId: attendance.id, studentId: { in: presentIds } }, data: { status: "PRESENT", updatedAt: now } }) : Promise.resolve(),
        absentIds.length ? tx.dailyAttendanceEntry.updateMany({ where: { dailyAttendanceId: attendance.id, studentId: { in: absentIds } }, data: { status: "ABSENT", updatedAt: now } }) : Promise.resolve(),
      ]);
      const newEntries = entries.filter(entry => !existingStudentIds.has(entry.studentId));
      if (newEntries.length) await tx.dailyAttendanceEntry.createMany({ data: newEntries.map(entry => ({ dailyAttendanceId: attendance.id, studentId: entry.studentId, status: entry.status, updatedAt: now })) });
    }
    if (changes.length) await tx.dailyAttendanceAudit.createMany({ data: changes });
    return attendance;
  }, { maxWait: 10000, timeout: 30000 });
  return NextResponse.json({ ok: true, submittedAt: record.submittedAt });
}
