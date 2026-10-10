import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_ATTENDANCE_THRESHOLD, getAttendanceView } from "@/lib/attendance";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows=await db.messageLog.findMany({ where: user.role === "TEACHER" ? { student: { sectionId: user.sectionId ?? "" } } : {}, select: { id: true, senderName: true, sentById: true, channel: true, status: true, mode: true, toNumber: true, createdAt: true, student: { select: { name: true, avgAtt:true,totalAttendancePct:true,lastListDate:true,isDetained:true,lowSubjectCount:true,section: { select: { name: true } } } },batch:{select:{testMode:true}}, error: true }, orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json(rows.map(row=>{const attendance=getAttendanceView(row.student,DEFAULT_ATTENDANCE_THRESHOLD);return{...row,attendance:attendance.pct,attendanceSource:attendance.sourceLabel,attendanceStatus:attendance.status};}));
}
