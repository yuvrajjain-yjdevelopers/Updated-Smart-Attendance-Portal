import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeIndianMobile } from "@/lib/phone";
import { regeneratePreparedMessages } from "@/lib/preparedMessages";
import { DEFAULT_ATTENDANCE_THRESHOLD, attendanceSourceLabel, getEffectiveAttendance, getStatus } from "@/lib/attendance";

type Context={params:Promise<{id:string}>};
const schema=z.object({regNo:z.string().trim().min(1).max(100),name:z.string().trim().min(1).max(160),parentMobile:z.string().optional().default(""),studentMobile:z.string().optional().default(""),branch:z.string().optional(),totalAttendancePct:z.number().min(0).max(100).nullable().optional()});
export async function GET(_:Request,{params}:Context){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  if(user.role!=="HOD"&&!(user.role==="TEACHER"&&user.sectionId===id))return NextResponse.json({error:"Forbidden"},{status:403});
  const [rows,settings]=await Promise.all([
    db.student.findMany({where:{sectionId:id},orderBy:{regNo:"asc"}}),
    db.setting.findMany({where:{key:{in:["attendanceThreshold","threshold"]}},select:{key:true,value:true}}),
  ]);
  const settingValues=Object.fromEntries(settings.map(setting=>[setting.key,setting.value]));
  const threshold=Number(settingValues.attendanceThreshold||settingValues.threshold||DEFAULT_ATTENDANCE_THRESHOLD);
  return NextResponse.json(rows.map(student=>{
    const attendance=getEffectiveAttendance(student);
    return{...student,effectiveAttendance:attendance.pct,attendanceSource:attendance.source,attendanceSourceLabel:attendanceSourceLabel(attendance),attendanceStatus:getStatus(student,threshold),attendanceThreshold:threshold};
  }));
}
export async function POST(request:Request,{params}:Context){const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="HOD")return NextResponse.json({error:"Forbidden"},{status:403});const {id}=await params;if(!await db.section.findUnique({where:{id},select:{id:true}}))return NextResponse.json({error:"Section not found"},{status:404});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Provide a registration number and student name"},{status:400});try{const data=parsed.data;const parent=data.parentMobile?normalizeIndianMobile(data.parentMobile):"";const mobile=data.studentMobile?normalizeIndianMobile(data.studentMobile):null;const attendance=data.totalAttendancePct??null;const student=await db.student.create({data:{regNo:data.regNo.toUpperCase(),name:data.name,sectionId:id,parentMobile:parent,studentMobile:mobile,branch:data.branch||null,totalAttendancePct:attendance}});await regeneratePreparedMessages(id);return NextResponse.json(student,{status:201});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Registration number already exists"},{status:409});}}
