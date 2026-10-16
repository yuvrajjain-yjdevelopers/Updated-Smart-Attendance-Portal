import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizePreparedNumber, prepareSelectedForSender } from "@/lib/preparedMessages";
import { DEFAULT_ATTENDANCE_THRESHOLD, attendanceSourceLabel, getEffectiveAttendance, getStatus } from "@/lib/attendance";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const startedAt=performance.now();
 const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(user.role==="TEACHER"&&!user.canSend)return NextResponse.json({error:"Sending is disabled for your account"},{status:403});
 const params=new URL(request.url).searchParams;
 const sectionId=params.get("sectionId")||undefined;
 const studentIds=(params.get("studentIds")||"").split(",").filter(Boolean);
 const channelValue=params.get("channel");
 const channel=channelValue==="SMS"||channelValue==="WHATSAPP"?channelValue:undefined;
 if(user.role==="TEACHER"&&sectionId&&sectionId!==user.sectionId)return NextResponse.json({error:"One or more students are outside your permitted section"},{status:403});
 if(studentIds.length&&(!channel||studentIds.length>500))return NextResponse.json({error:"Select a valid channel and up to 500 students"},{status:400});
 const scopeSection=user.role==="TEACHER"?user.sectionId||"":sectionId;
 if(studentIds.length){if(!scopeSection)return NextResponse.json({error:"Select a section before preparing messages"},{status:400});try{await prepareSelectedForSender({senderId:user.id,sectionId:scopeSection,studentIds,channel:channel!});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not prepare messages"},{status:500});}}
 const rows=await db.preparedMessage.findMany({where:{senderId:user.id,...(channel?{channel}:{}),...(studentIds.length?{studentId:{in:studentIds}}:{}),...(sectionId?{student:{sectionId}}:user.role==="TEACHER"?{student:{sectionId:user.sectionId||""}}:{})},include:{student:{include:{section:true}}},orderBy:[{student:{section:{name:"asc"}}},{student:{name:"asc"}}]});
 const settings=Object.fromEntries((await db.setting.findMany()).map(x=>[x.key,x.value]));
 const threshold=Number(settings.attendanceThreshold||settings.threshold||DEFAULT_ATTENDANCE_THRESHOLD);
 const testMode=settings.testMode!=="false";
 return NextResponse.json({messages:rows.map(x=>{const attendance=getEffectiveAttendance(x.student);return{id:x.id,studentId:x.studentId,name:x.student.name,regNo:x.student.regNo,avgAtt:attendance.pct,attendanceSource:attendance.source,attendanceSourceLabel:attendanceSourceLabel(attendance),statusLabel:getStatus(x.student,threshold),section:x.student.section.name,channel:x.channel,status:x.status,toNumber:testMode?normalizePreparedNumber(settings.testNumber||""):x.toNumber,text:x.text,listDate:attendance.listDate||x.listDate,excludeReason:x.status==="MISSING_NUMBER"?"Missing or invalid parent number":null}}),testMode,testNumber:normalizePreparedNumber(settings.testNumber||"")||settings.testNumber||"",preparedMs:Math.round(performance.now()-startedAt)});
}
