import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeIndianMobile } from "@/lib/phone";
import { regeneratePreparedMessages } from "@/lib/preparedMessages";
export async function PUT(request: Request) { const user = await currentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const parsed = z.object({ mobile: z.string().trim().min(1).max(20) }).safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Enter a valid contact number" }, { status: 400 });try{const mobile=normalizeIndianMobile(parsed.data.mobile);await db.user.update({ where: { id: user.id }, data: { mobile } }); await regeneratePreparedMessages(user.role==="TEACHER"?user.sectionId||undefined:undefined); return NextResponse.json({ ok: true });}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Enter a valid contact number"},{status:400});} }
