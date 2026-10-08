import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import ClassMessaging from "@/app/components/class-messaging";
export const dynamic = "force-dynamic";
export default async function MyClass() { const user = await currentUser(); if (!user) redirect("/login"); if (user.role !== "TEACHER") redirect("/dashboard"); const students = await db.student.findMany({ where: { sectionId: user.sectionId ?? "", isDetained: true }, orderBy: { avgAtt: "asc" } }); return <main className="p-8"><p className="text-sm font-medium text-indigo-700">MY CLASS</p><h1 className="mt-1 text-3xl font-bold">{user.section?.name ?? "No section assigned"}</h1><p className="mt-2 text-slate-600">{students.length} detained students · Your messages are limited to this section.</p><ClassMessaging students={students} senderName={user.name} canSend={user.canSend}/></main> }
