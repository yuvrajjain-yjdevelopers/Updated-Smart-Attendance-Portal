import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendAndroidSms } from "@/lib/sms/androidGateway";
import { gatewayForSender } from "@/lib/sms/senderGateway";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const phone = (await request.json().catch(() => ({}))).phone as string | undefined;
  if (!user.smsGatewaySenderNumber) return NextResponse.json({ error: "Set up your phone in Settings first", setupUrl: "/settings#phone-setup" }, { status: 400 });
  try {
    await sendAndroidSms(gatewayForSender(user), "Smart Attendance Portal connection test", phone || user.smsGatewaySenderNumber);
    await db.user.update({ where: { id: user.id }, data: { smsGatewayLastTestAt: new Date(), smsGatewayLastSuccessfulTestAt: new Date(), smsGatewayLastTestOk: true } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await db.user.update({ where: { id: user.id }, data: { smsGatewayLastTestAt: new Date(), smsGatewayLastTestOk: false } });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gateway test failed" }, { status: 502 });
  }
}
