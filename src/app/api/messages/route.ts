import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await db.messageLog.findMany({ where: user.role === "TEACHER" ? { student: { sectionId: user.sectionId ?? "" } } : {}, select: { id: true, senderName: true, sentById: true, channel: true, status: true, toNumber: true, createdAt: true, student: { select: { name: true, section: { select: { name: true } } } },batch:{select:{testMode:true}}, error: true }, orderBy: { createdAt: "desc" }, take: 500 }));
}
