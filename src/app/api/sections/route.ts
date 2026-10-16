import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { DEFAULT_ATTENDANCE_THRESHOLD } from "@/lib/attendance";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { generateTeacherPassword } from "@/lib/teacherCredentials";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "HOD") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const thresholdRowsPromise = db.setting.findMany({ where: { key: { in: ["attendanceThreshold", "threshold"] } }, select: { key: true, value: true } });
  const [rows, settings] = await Promise.all([
    db.section.findMany({
      select: {
        id: true, name: true,
        _count: { select: { students: true } },
        users: { where: { role: "TEACHER" }, select: { id: true, name: true, username: true } },
        uploads: { orderBy: { uptoDate: "desc" }, take: 1, select: { uptoDate: true } },
      },
      orderBy: { name: "asc" },
    }),
    thresholdRowsPromise,
  ]);
  const values = Object.fromEntries(settings.map(row => [row.key, row.value]));
  const threshold = Number(values.attendanceThreshold || values.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  const detainedRows = await db.student.groupBy({
    by: ["sectionId"],
    where: { OR: [
      { avgAtt: { lt: threshold }, lastListDate: { not: null } },
      { totalAttendancePct: { lt: threshold }, OR: [{ avgAtt: null }, { lastListDate: null }] },
    ] },
    _count: { _all: true },
  });
  const detainedCounts = new Map(detainedRows.map(row => [row.sectionId, row._count._all]));
  return NextResponse.json(rows.map(section => ({
    id: section.id,
    name: section.name,
    studentCount: section._count.students,
    detainedCount: detainedCounts.get(section.id) ?? 0,
    teachers: section.users,
    dataAsOf: section.uploads[0]?.uptoDate ?? null,
  })));
}
export async function POST(request:Request) { const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="HOD")return NextResponse.json({error:"Forbidden"},{status:403});const parsed=z.object({name:z.string().trim().min(1).max(40),createTeacherLogin:z.boolean().default(false)}).safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Enter a section name"},{status:400});try { const section=await db.section.create({data:{name:parsed.data.name}});if(!parsed.data.createTeacherLogin)return NextResponse.json(section,{status:201});const slug=section.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"class";let username="";for(let i=0;i<50;i++){const candidate=`t-${slug}-${String(randomInt(10000)).padStart(4,"0")}`;if(!await db.user.findUnique({where:{username:candidate},select:{id:true}})){username=candidate;break;}}if(!username)throw new Error("Could not create a unique teacher username");const password=generateTeacherPassword();const teacher=await db.user.create({data:{username,name:`${section.name} Teacher`,role:"TEACHER",sectionId:section.id,passwordHash:await bcrypt.hash(password,12)}});return NextResponse.json({section,credentials:{name:teacher.name,username,password,section:section.name}},{status:201}); } catch { return NextResponse.json({error:"A section with that name already exists, or teacher login could not be created"},{status:409}); } }
