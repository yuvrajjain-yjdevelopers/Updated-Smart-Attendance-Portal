import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeIndianMobile } from "@/lib/phone";
import { regeneratePreparedMessages } from "@/lib/preparedMessages";
import { manualAttendanceOverride } from "@/lib/attendance";
type Context={params:Promise<{id:string;studentId:string}>};
const schema=z.object({regNo:z.string().trim().min(1).max(100),name:z.string().trim().min(1).max(160),parentMobile:z.string().optional().default(""),studentMobile:z.string().optional().default(""),branch:z.string().optional(),totalAttendancePct:z.number().min(0).max(100).nullable().optional()});
export async function PATCH(request:Request,{params}:Context){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id,studentId}=await params;
  if(user.role!=="HOD"&&!(user.role==="TEACHER"&&user.sectionId===id))return NextResponse.json({error:"Forbidden"},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Provide a registration number and student name"},{status:400});
  try{
    const data=parsed.data;
    const existing=await db.student.findFirst({where:{id:studentId,sectionId:id},select:{totalAttendancePct:true}});
    if(!existing)return NextResponse.json({error:"Student not found"},{status:404});
    const attendanceChanged=data.totalAttendancePct!==undefined&&data.totalAttendancePct!==existing.totalAttendancePct;
    const item=await db.student.update({where:{id:studentId,sectionId:id},data:{
      regNo:data.regNo.toUpperCase(),
      name:data.name,
      parentMobile:data.parentMobile?normalizeIndianMobile(data.parentMobile):"",
      studentMobile:data.studentMobile?normalizeIndianMobile(data.studentMobile):null,
      branch:data.branch||null,
      ...(attendanceChanged ? manualAttendanceOverride(data.totalAttendancePct!) : {}),
    }});
    await regeneratePreparedMessages(id);
    return NextResponse.json(item);
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Student not found or registration number already exists"},{status:409});
  }
}
export async function DELETE(_:Request,{params}:Context){const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="HOD")return NextResponse.json({error:"Forbidden"},{status:403});const {id,studentId}=await params;try{await db.student.delete({where:{id:studentId,sectionId:id}});return NextResponse.json({deleted:true});}catch{return NextResponse.json({error:"Student not found"},{status:404});}}
