import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_ATTENDANCE_THRESHOLD, getAttendanceView } from "@/lib/attendance";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = new URL(request.url).searchParams.get("kind");
  const kindFilter = kind === "ABSENCE" || kind === "DETENTION" ? { kind } : {};
  const attendanceFields = { avgAtt:true,totalAttendancePct:true,lastListDate:true,isDetained:true,lowSubjectCount:true } as const;
  const rows=await db.messageLog.findMany({ where: { ...(user.role === "TEACHER" ? { student: { sectionId: user.sectionId ?? "" } } : {}), ...kindFilter }, select: { id: true, senderName: true, sentById: true, channel: true, kind: true, status: true, mode: true, toNumber: true, createdAt: true, student: { select: { name: true, section: { select: { name: true } }, ...(kind === "ABSENCE" ? {} : attendanceFields) } },batch:{select:{testMode:true}}, error: true }, orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json(rows.map(row=>{const attendance=row.kind === "ABSENCE" ? null : getAttendanceView(row.student,DEFAULT_ATTENDANCE_THRESHOLD);return{...row,attendance:attendance?.pct ?? null,attendanceSource:attendance?.sourceLabel ?? "",attendanceStatus:attendance?.status ?? ""};}));
}
