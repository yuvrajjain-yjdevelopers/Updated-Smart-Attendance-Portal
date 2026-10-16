import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET() { const user = await currentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const settings=Object.fromEntries((await db.setting.findMany({where:{key:{in:["testMode","testNumber"]}}})).map(x=>[x.key,x.value]));return NextResponse.json({ id: user.id, name: user.name, role: user.role, section: user.section?.name, mobileLinkMode: user.mobileLinkMode, testMode: settings.testMode!=="false",testNumber:settings.testNumber||"" }); }
