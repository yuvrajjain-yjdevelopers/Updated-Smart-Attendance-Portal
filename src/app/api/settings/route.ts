import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTrilingualSmsTemplate, getTrilingualWhatsAppTemplate } from "@/lib/messageTemplates";
import { regeneratePreparedMessages } from "@/lib/preparedMessages";
import { DEFAULT_ABSENCE_SMS_TEMPLATE, DEFAULT_ABSENCE_WHATSAPP_TEMPLATE, ensureTrilingualAbsenceTemplate } from "@/features/daily-attendance/messages";
export const dynamic = "force-dynamic";
const schema = z.object({ testMode: z.boolean(), testNumber: z.string().min(8).max(20), collegeName: z.string().max(100), department: z.string().max(100), smsTemplate: z.string().max(2000), whatsappTemplate: z.string().max(5000), absenceSmsTemplate: z.string().max(1000).optional(), absenceWhatsappTemplate: z.string().max(3000).optional(), teacherDailyAttendanceEditWindowDays: z.number().int().min(0).max(31).optional(), absenceMessagesAfter: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/).optional() }).refine(data => [data.absenceSmsTemplate, data.absenceWhatsappTemplate].filter(Boolean).every(template => !/%|\{\s*(?:avg|subjects|detained_count)\s*\}|\b(?:attendance percentage|detained subjects|detained)\b|कम उपस्थिति वाले विषय|कमी उपस्थितीचे विषय|औसत उपस्थिति|सरासरी उपस्थिती/i.test(template!)), { message: "Absence templates cannot contain attendance percentages or detention details", path: ["absenceSmsTemplate"] });
export async function GET() {
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="HOD")return NextResponse.json({error:"Forbidden"},{status:403});
  const settings=Object.fromEntries((await db.setting.findMany()).map(x=>[x.key,x.value]));
  return NextResponse.json({testMode:settings.testMode!=="false",testNumber:settings.testNumber||"",collegeName:settings.collegeName||"",department:settings.department||"",smsTemplate:getTrilingualSmsTemplate(settings),whatsappTemplate:getTrilingualWhatsAppTemplate(settings),absenceSmsTemplate:ensureTrilingualAbsenceTemplate(settings.absenceSmsTemplate,DEFAULT_ABSENCE_SMS_TEMPLATE),absenceWhatsappTemplate:ensureTrilingualAbsenceTemplate(settings.absenceWhatsappTemplate,DEFAULT_ABSENCE_WHATSAPP_TEMPLATE),teacherDailyAttendanceEditWindowDays:Number(settings.teacherDailyAttendanceEditWindowDays||1),absenceMessagesAfter:settings.absenceMessagesAfter||""});
}
export async function PUT(request:Request) {
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="HOD")return NextResponse.json({error:"Forbidden"},{status:403});
  const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:parsed.error.flatten()},{status:400});
  const {smsTemplate,whatsappTemplate,absenceSmsTemplate,absenceWhatsappTemplate,teacherDailyAttendanceEditWindowDays,absenceMessagesAfter,...general}=parsed.data;
  const values:Record<string,string>={...Object.fromEntries(Object.entries(general).map(([key,value])=>[key,String(value)])),smsTemplateAllLanguages:smsTemplate,whatsappTemplateAllLanguages:whatsappTemplate,...(absenceSmsTemplate!==undefined?{absenceSmsTemplate}:{}),...(absenceWhatsappTemplate!==undefined?{absenceWhatsappTemplate}:{}),...(teacherDailyAttendanceEditWindowDays!==undefined?{teacherDailyAttendanceEditWindowDays:String(teacherDailyAttendanceEditWindowDays)}:{}),...(absenceMessagesAfter!==undefined?{absenceMessagesAfter}:{})};
  const before = Object.fromEntries((await db.setting.findMany({ where: { key: { in: Object.keys(values) } }, select: { key: true, value: true } })).map(row => [row.key, row.value]));
  await db.$transaction(Object.entries(values).map(([key,value])=>db.setting.upsert({where:{key},update:{value},create:{key,value}})));
  const detentionPreparationKeys = ["testMode", "testNumber", "collegeName", "department", "smsTemplateAllLanguages", "whatsappTemplateAllLanguages"];
  if (detentionPreparationKeys.some(key => before[key] !== values[key])) await regeneratePreparedMessages();
  return NextResponse.json({ok:true});
}
