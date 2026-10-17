import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTIVE_SESSION_STATUSES } from "@/lib/sendSessions";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.sendSession.findMany({
    where: { userId: user.id, ...(user.role === "TEACHER" ? { sectionId: user.sectionId || "" } : {}), status: { in: [...ACTIVE_SESSION_STATUSES] } },
    include: { section: { select: { name: true } }, items: { select: { status: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ sessions: rows.map(session => ({
    id: session.id,
    channel: session.channel,
    kind: session.kind,
    sectionId: session.sectionId,
    sectionName: session.section.name,
    status: session.status,
    currentIndex: session.currentIndex,
    total: session.items.length,
    done: session.items.filter(item => ["SENT_BY_USER", "SKIPPED", "FAILED", "EXCLUDED"].includes(item.status)).length,
    testMode: session.testMode,
    role: user.role,
  })) });
}
