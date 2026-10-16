import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectionIsConfirmed } from "@/lib/sendSessions";

const schema = z.object({ kind: z.enum(["WHATSAPP_WEB", "MOBILE_LINK"]), action: z.enum(["CONFIRM", "NOT_WORKING", "SET_MODE"]), mode: z.enum(["SMS_LINK", "GOOGLE_MESSAGES", "PHONE"]).optional() });
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [rows, account] = await Promise.all([db.messagingConnection.findMany({ where: { userId: user.id } }), db.user.findUnique({ where: { id: user.id }, select: { mobileLinkMode: true } })]);
  const byKind = new Map(rows.map(row => [row.kind, row]));
  return NextResponse.json({ mobileLinkMode: account?.mobileLinkMode || "SMS_LINK", connections: ["WHATSAPP_WEB", "MOBILE_LINK"].map(kind => {
    const row = byKind.get(kind as "WHATSAPP_WEB" | "MOBILE_LINK");
    const confirmed = connectionIsConfirmed(row?.confirmedAt);
    return { kind, confirmed, confirmedAt: confirmed ? row?.confirmedAt : null, label: confirmed ? "Confirmed by you" : "Not confirmed" };
  }) });
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a connection and action." }, { status: 400 });
  if (parsed.data.action === "SET_MODE") {
    if (parsed.data.kind !== "MOBILE_LINK" || !parsed.data.mode) return NextResponse.json({ error: "Choose a mobile link mode." }, { status: 400 });
    await db.user.update({ where: { id: user.id }, data: { mobileLinkMode: parsed.data.mode } });
    return NextResponse.json({ mode: parsed.data.mode });
  }
  const confirmedAt = parsed.data.action === "CONFIRM" ? new Date() : null;
  const connection = await db.messagingConnection.upsert({
    where: { userId_kind: { userId: user.id, kind: parsed.data.kind } },
    create: { userId: user.id, kind: parsed.data.kind, confirmedAt },
    update: { confirmedAt },
  });
  return NextResponse.json({ kind: connection.kind, confirmed: connectionIsConfirmed(connection.confirmedAt), confirmedAt: connection.confirmedAt });
}
