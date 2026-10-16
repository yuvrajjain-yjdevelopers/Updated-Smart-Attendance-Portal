import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSmsMetrics, MAX_SMS_PARTS } from "@/lib/messageTemplates";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = z.object({ text: z.string().min(1).max(20_000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Message text is required and must be 20,000 characters or fewer." }, { status: 400 });
  }

  try {
    const row = await db.preparedMessage.findUnique({ where: { id }, include: { student: true } });
    if (!row) return NextResponse.json({ error: "Prepared message not found" }, { status: 404 });
    if (row.senderId !== user.id || (user.role === "TEACHER" && row.student.sectionId !== user.sectionId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (row.channel === "SMS" && getSmsMetrics(parsed.data.text).parts > MAX_SMS_PARTS) {
      return NextResponse.json({ error: `SMS must fit within ${MAX_SMS_PARTS} parts.` }, { status: 400 });
    }

    await db.$transaction([
      db.preparedMessage.update({ where: { id }, data: { text: parsed.data.text } }),
      db.messageLog.updateMany({
        where: { sentById: user.id, studentId: row.studentId, channel: row.channel, status: { in: ["QUEUED", "OPENED"] } },
        data: { text: parsed.data.text },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save prepared message edit", { id, error });
    return NextResponse.json({ error: "The database could not save this message. Please retry; if it continues, contact the administrator." }, { status: 500 });
  }
}
