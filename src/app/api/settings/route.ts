import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTrilingualSmsTemplate, getTrilingualWhatsAppTemplate } from "@/lib/messageTemplates";
import { regeneratePreparedMessages } from "@/lib/preparedMessages";
export const dynamic = "force-dynamic";
const schema = z.object({ testMode: z.boolean(), testNumber: z.string().min(8).max(20), collegeName: z.string().max(100), department: z.string().max(100), smsTemplate: z.string().max(2000), whatsappTemplate: z.string().max(5000) });
export async function GET() {
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="HOD")return NextResponse.json({error:"Forbidden"},{status:403});
  const settings=Object.fromEntries((await db.setting.findMany()).map(x=>[x.key,x.value]));
  return NextResponse.json({testMode:settings.testMode!=="false",testNumber:settings.testNumber||"",collegeName:settings.collegeName||"",department:settings.department||"",smsTemplate:getTrilingualSmsTemplate(settings),whatsappTemplate:getTrilingualWhatsAppTemplate(settings)});
}
export async function PUT(request:Request) {
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="HOD")return NextResponse.json({error:"Forbidden"},{status:403});
  const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:parsed.error.flatten()},{status:400});
  const {smsTemplate,whatsappTemplate,...general}=parsed.data;
  const values:Record<string,string>={...Object.fromEntries(Object.entries(general).map(([key,value])=>[key,String(value)])),smsTemplateAllLanguages:smsTemplate,whatsappTemplateAllLanguages:whatsappTemplate};
  await db.$transaction(Object.entries(values).map(([key,value])=>db.setting.upsert({where:{key},update:{value},create:{key,value}})));
  await regeneratePreparedMessages();return NextResponse.json({ok:true});
}
