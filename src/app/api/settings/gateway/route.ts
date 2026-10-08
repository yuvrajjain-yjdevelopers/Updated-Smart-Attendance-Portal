import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { publicGatewayStatus } from "@/lib/sms/senderGateway";

export const dynamic = "force-dynamic";
const schema = z.object({ mode: z.enum(["LOCAL", "CLOUD"]), baseUrl: z.string().url().optional().or(z.literal("")), username: z.string().optional(), password: z.string().optional(), senderNumber: z.string().min(8).max(20) });
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(publicGatewayStatus(user));
}
export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  if(input.mode==="LOCAL"&&!input.baseUrl)return NextResponse.json({error:"Enter the phone's Local Server URL"},{status:400});
  const update: Record<string, unknown> = { smsGatewayMode: input.mode, smsGatewayUrl: input.mode === "LOCAL" ? input.baseUrl : null, smsGatewaySenderNumber: input.senderNumber };
  if (input.username?.trim()) update.smsGatewayUser = input.username.trim();
  if (input.password) update.smsGatewayPassEnc = encryptSecret(input.password);
  if (!(input.username?.trim() || user.smsGatewayUser) || !(input.password || user.smsGatewayPassEnc)) return NextResponse.json({ error: "Username and password are required for first setup" }, { status: 400 });
  await db.user.update({ where: { id: user.id }, data: update });
  return NextResponse.json({ configured: true });
}
