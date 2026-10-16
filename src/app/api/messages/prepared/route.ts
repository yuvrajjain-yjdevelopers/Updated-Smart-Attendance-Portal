import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizePreparedNumber, prepareSelectedForSender } from "@/lib/preparedMessages";
import { DEFAULT_ATTENDANCE_THRESHOLD, attendanceSourceLabel, getEffectiveAttendance, getStatus } from "@/lib/attendance";

export const dynamic = "force-dynamic";

type Progress = { processed: number; total: number; prepared: number };
type ProgressListener = (progress: Progress) => void | Promise<void>;

async function readPreparedMessages(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>, sectionId: string | undefined, studentIds: string[], channel: "SMS" | "WHATSAPP" | undefined, startedAt: number) {
  const where: Prisma.PreparedMessageWhereInput = {
    senderId: user.id,
    ...(channel ? { channel } : {}),
    ...(studentIds.length ? { studentId: { in: studentIds } } : {}),
    ...(sectionId ? { student: { sectionId } } : user.role === "TEACHER" ? { student: { sectionId: user.sectionId || "" } } : {}),
  };
  const [rows, settingRows] = await Promise.all([
    db.preparedMessage.findMany({
      where,
      select: {
        id: true, studentId: true, channel: true, status: true, toNumber: true, text: true, listDate: true,
        student: { select: { name: true, regNo: true, avgAtt: true, totalAttendancePct: true, lastListDate: true, isDetained: true, lowSubjectCount: true, section: { select: { name: true } } } },
      },
      orderBy: [{ student: { section: { name: "asc" } } }, { student: { name: "asc" } }],
    }),
    db.setting.findMany({ where: { key: { in: ["attendanceThreshold", "threshold", "testMode", "testNumber"] } }, select: { key: true, value: true } }),
  ]);
  const settings = Object.fromEntries(settingRows.map(row => [row.key, row.value]));
  const threshold = Number(settings.attendanceThreshold || settings.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  const testMode = settings.testMode !== "false";
  return {
    messages: rows.map(row => {
      const attendance = getEffectiveAttendance(row.student);
      return {
        id: row.id, studentId: row.studentId, name: row.student.name, regNo: row.student.regNo,
        avgAtt: attendance.pct, attendanceSource: attendance.source, attendanceSourceLabel: attendanceSourceLabel(attendance),
        statusLabel: getStatus(row.student, threshold), section: row.student.section.name,
        channel: row.channel, status: row.status,
        toNumber: testMode ? normalizePreparedNumber(settings.testNumber || "") : row.toNumber,
        text: row.text, listDate: attendance.listDate || row.listDate,
        excludeReason: row.status === "MISSING_NUMBER" ? "Missing or invalid parent number" : null,
      };
    }),
    testMode,
    testNumber: normalizePreparedNumber(settings.testNumber || "") || settings.testNumber || "",
    preparedMs: Math.round(performance.now() - startedAt),
  };
}

function event(controller: ReadableStreamDefaultController<Uint8Array>, value: unknown) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "TEACHER" && !user.canSend) return NextResponse.json({ error: "Sending is disabled for your account" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const sectionId = params.get("sectionId") || undefined;
  const studentIds = [...new Set((params.get("studentIds") || "").split(",").filter(Boolean))];
  const channelValue = params.get("channel");
  const channel: "SMS" | "WHATSAPP" | undefined = channelValue === "SMS" || channelValue === "WHATSAPP" ? channelValue : undefined;
  if (user.role === "TEACHER" && sectionId && sectionId !== user.sectionId) return NextResponse.json({ error: "One or more students are outside your permitted section" }, { status: 403 });
  if (studentIds.length && (!channel || studentIds.length > 500)) return NextResponse.json({ error: "Select a valid channel and up to 500 students" }, { status: 400 });
  const scopeSection = user.role === "TEACHER" ? user.sectionId || "" : sectionId;
  if (studentIds.length && !scopeSection) return NextResponse.json({ error: "Select a section before preparing messages" }, { status: 400 });

  const prepare = async (onProgress?: ProgressListener) => {
    if (studentIds.length) await prepareSelectedForSender({ senderId: user.id, sectionId: scopeSection!, studentIds, channel: channel! }, onProgress);
    return readPreparedMessages(user, sectionId, studentIds, channel, startedAt);
  };

  if (params.get("stream") === "1" && studentIds.length) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        event(controller, { type: "progress", progress: { processed: 0, total: studentIds.length, prepared: 0 } });
        void (async () => {
          try {
            const result = await prepare(async progress => {
              event(controller, { type: "progress", progress: { ...progress, total: studentIds.length } });
              await new Promise(resolve => setTimeout(resolve, 0));
            });
            event(controller, { type: "complete", data: result });
          } catch (error) {
            event(controller, { type: "error", message: error instanceof Error ? error.message : "Could not prepare messages." });
          } finally {
            controller.close();
          }
        })();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  }

  try {
    return NextResponse.json(await prepare());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare messages." }, { status: 500 });
  }
}
