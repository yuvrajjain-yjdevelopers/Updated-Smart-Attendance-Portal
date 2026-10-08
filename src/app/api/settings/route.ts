import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_SMS_TEMPLATE, DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/messageTemplates";
export const dynamic = "force-dynamic";
const schema = z.object({ testMode: z.boolean(), testNumber: z.string().min(8).max(20), collegeName: z.string().max(100), department: z.string().max(100), smsTemplate: z.string().max(160).regex(/^[\x00-\x7F]*$/,"SMS template must use ASCII characters only"), whatsappTemplate: z.string().max(3000) });
export async function GET() { const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="HOD")return NextResponse.json({error:"Forbidden"},{status:403});const settings=Object.fromEntries((await db.setting.findMany()).map(x=>[x.key,x.value]));return NextResponse.json({testMode:settings.testMode!=="false",testNumber:settings.testNumber||"",collegeName:settings.collegeName||"",department:settings.department||"",smsTemplate:settings.smsTemplate||DEFAULT_SMS_TEMPLATE,whatsappTemplate:settings.whatsappTemplate||DEFAULT_WHATSAPP_TEMPLATE}); }
export async function PUT(request:Request) { const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="HOD")return NextResponse.json({error:"Forbidden"},{status:403});const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:parsed.error.flatten()},{status:400});await db.$transaction(Object.entries(parsed.data).map(([key,value])=>db.setting.upsert({where:{key},update:{value:String(value)},create:{key,value:String(value)}})));return NextResponse.json({ok:true}); }
