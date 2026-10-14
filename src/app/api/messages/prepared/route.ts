import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildPreparedText, ensurePreparedForSender, normalizePreparedNumber } from "@/lib/preparedMessages";
import { DEFAULT_ATTENDANCE_THRESHOLD, attendanceSourceLabel, getEffectiveAttendance, getStatus } from "@/lib/attendance";
import { getTrilingualSmsTemplate, getTrilingualWhatsAppTemplate } from "@/lib/messageTemplates";
import { parseDetainedSubjects } from "@/lib/detentionSubjects";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(user.role==="TEACHER"&&!user.canSend)return NextResponse.json({error:"Sending is disabled for your account"},{status:403});
 const sectionId=new URL(request.url).searchParams.get("sectionId")||undefined;
 if(user.role==="TEACHER"&&sectionId&&sectionId!==user.sectionId)return NextResponse.json({error:"One or more students are outside your permitted section"},{status:403});
 await ensurePreparedForSender(user.id,user.role==="TEACHER"?user.sectionId||"":sectionId);
 const rows=await db.preparedMessage.findMany({where:{senderId:user.id,...(sectionId?{student:{sectionId}}:user.role==="TEACHER"?{student:{sectionId:user.sectionId||""}}:{})},include:{student:{include:{section:true}}},orderBy:[{student:{section:{name:"asc"}}},{student:{name:"asc"}}]});
 const settings=Object.fromEntries((await db.setting.findMany()).map(x=>[x.key,x.value]));
 const testMode=settings.testMode!=="false";
 return NextResponse.json({messages:rows.map(x=>{const attendance=getEffectiveAttendance(x.student);const subjects=attendance.source==="LIST"?parseDetainedSubjects(x.student.detainedSubjects).map(subject=>`${subject.code} - ${subject.name}`):[];const listDate=attendance.listDate?new Date(attendance.listDate):x.listDate||new Date();const template=x.channel==="SMS"?getTrilingualSmsTemplate(settings):getTrilingualWhatsAppTemplate(settings);const text=buildPreparedText({template,studentName:x.student.name,regNo:x.student.regNo,section:x.student.section.name,avg:attendance.pct,subjects,date:listDate,senderName:user.name,senderMobile:user.mobile||"",collegeName:settings.collegeName||"College",department:settings.department||"Department",testMode,channel:x.channel});return{id:x.id,studentId:x.studentId,name:x.student.name,regNo:x.student.regNo,avgAtt:attendance.pct,attendanceSource:attendance.source,attendanceSourceLabel:attendanceSourceLabel(attendance),statusLabel:getStatus(x.student,DEFAULT_ATTENDANCE_THRESHOLD),section:x.student.section.name,channel:x.channel,status:x.status,toNumber:testMode?normalizePreparedNumber(settings.testNumber||""):x.toNumber,text,listDate:attendance.listDate||x.listDate}}),testMode,testNumber:normalizePreparedNumber(settings.testNumber||"")||settings.testNumber||""});
}
