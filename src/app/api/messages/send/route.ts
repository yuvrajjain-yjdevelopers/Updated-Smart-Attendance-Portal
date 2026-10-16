import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSendForSection, resolveRecipient } from "@/lib/sendCenter";
import { DEFAULT_ATTENDANCE_THRESHOLD, attendanceSourceLabel, getEffectiveAttendance, getStatus } from "@/lib/attendance";
export const dynamic = "force-dynamic";
const schema = z.object({ preparedIds: z.array(z.string()).min(1).max(500), channel: z.enum(["SMS", "WHATSAPP"]) });
export async function POST(request: Request) {
 const sender=await currentUser(); if(!sender)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(sender.role==="TEACHER"&&!sender.canSend)return NextResponse.json({error:"Sending is disabled for your account"},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return NextResponse.json({error:parsed.error.flatten()},{status:400});
 const messages=await db.preparedMessage.findMany({where:{id:{in:parsed.data.preparedIds},senderId:sender.id,channel:parsed.data.channel},include:{student:{include:{section:true}}}});
 if(messages.length!==parsed.data.preparedIds.length)return NextResponse.json({error:"Prepared messages must belong to your account"},{status:403});
 if(messages.some(message=>message.status==="SENT"||message.status==="OPENED"))return NextResponse.json({error:"One or more selected messages were already opened or sent"},{status:409});
 if(messages.some(m=>!canSendForSection(sender.role,sender.canSend,sender.sectionId,m.student.sectionId)))return NextResponse.json({error:"One or more students are outside your permitted section"},{status:403});
 const settings=Object.fromEntries((await db.setting.findMany({where:{key:{in:["testMode","testNumber","attendanceThreshold","threshold"]}}})).map(x=>[x.key,x.value])); const threshold=Number(settings.attendanceThreshold||settings.threshold||DEFAULT_ATTENDANCE_THRESHOLD); const testMode=settings.testMode!=="false"; const testDestination=testMode?resolveRecipient(null,true,settings.testNumber||""):null;
 if(testMode&&!testDestination)return NextResponse.json({error:"Set a valid test number in Settings before sending in test mode"},{status:400});
 const queue=[];
 for(const m of messages){
  if(m.status==="MISSING_NUMBER")continue;
  const attendance=getEffectiveAttendance(m.student);const statusLabel=getStatus(m.student,threshold);if(statusLabel!=="Detained")continue;
  const number=resolveRecipient(m.toNumber,testMode,settings.testNumber||""); if(!number)continue;
  const batch=await db.messageBatch.create({data:{sectionId:m.student.sectionId,sentById:sender.id,senderName:sender.name,channels:m.channel,total:1,testMode}});
  const log=await db.messageLog.create({data:{batchId:batch.id,studentId:m.studentId,sentById:sender.id,senderName:sender.name,channel:m.channel,status:"QUEUED",mode:"pending",listDate:m.listDate,toNumber:number,text:m.text}});
  queue.push({id:log.id,preparedId:m.id,name:m.student.name,regNo:m.student.regNo,avgAtt:attendance.pct,attendanceSourceLabel:attendanceSourceLabel(attendance), statusLabel,section:m.student.section.name,toNumber:number,text:m.text,channel:m.channel,status:"QUEUED"});
 }
 return NextResponse.json({queue,testMode,testNumber:testDestination||settings.testNumber||"",excluded:messages.length-queue.length});
}
