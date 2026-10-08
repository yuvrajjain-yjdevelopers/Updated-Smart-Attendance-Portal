import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
export async function PUT(request: Request) { const user = await currentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const parsed = z.object({ mobile: z.string().trim().min(8).max(20) }).safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Enter a valid contact number" }, { status: 400 }); await db.user.update({ where: { id: user.id }, data: { mobile: parsed.data.mobile } }); return NextResponse.json({ ok: true }); }
