import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";
const schema = z.object({ mode: z.enum(["LOCAL", "CLOUD"]), baseUrl: z.string().url().optional().or(z.literal("")), username: z.string().min(1), password: z.string().min(1).optional(), senderNumber: z.string().min(8).max(20) });
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ configured: Boolean(user.smsGatewayMode && user.smsGatewayUser && user.smsGatewayPassEnc), mode: user.smsGatewayMode, baseUrl: user.smsGatewayUrl, username: user.smsGatewayUser, senderNumber: user.smsGatewaySenderNumber, lastTestAt: user.smsGatewayLastTestAt, lastTestOk: user.smsGatewayLastTestOk });
}
export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const update: Record<string, unknown> = { smsGatewayMode: input.mode, smsGatewayUrl: input.mode === "LOCAL" ? input.baseUrl : null, smsGatewayUser: input.username, smsGatewaySenderNumber: input.senderNumber };
  if (input.password) update.smsGatewayPassEnc = encryptSecret(input.password);
  if (!input.password && !user.smsGatewayPassEnc) return NextResponse.json({ error: "Password is required for first setup" }, { status: 400 });
  await db.user.update({ where: { id: user.id }, data: update });
  return NextResponse.json({ configured: true });
}
