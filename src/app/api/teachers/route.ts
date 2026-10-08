import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "HOD") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const teachers = await db.user.findMany({ where: { role: "TEACHER" }, include: { section: true }, select: { id: true, name: true, username: true, section: true, canSend: true, active: true, smsGatewayMode: true, smsGatewayUser: true, smsGatewayPassEnc: true, smsGatewayLastTestAt: true, smsGatewayLastTestOk: true, smsGatewaySenderNumber: true } });
  return NextResponse.json(teachers.map(({ smsGatewayMode, smsGatewayUser, smsGatewayPassEnc, smsGatewayLastTestAt, smsGatewayLastTestOk, smsGatewaySenderNumber, ...teacher }) => ({ ...teacher, gatewayConfigured: Boolean(smsGatewayMode && smsGatewayUser && smsGatewayPassEnc), senderNumber: smsGatewaySenderNumber, lastTestAt: smsGatewayLastTestAt, lastTestOk: smsGatewayLastTestOk })));
}
