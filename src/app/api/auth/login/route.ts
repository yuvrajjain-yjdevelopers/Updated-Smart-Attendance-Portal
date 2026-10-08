import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter username and password" }, { status: 400 });
  const user = await db.user.findUnique({ where: { username: parsed.data.username } });
  if (!user?.active || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  return NextResponse.json({ role: user.role, redirect: user.role === "HOD" ? "/dashboard" : "/my-class" });
}
