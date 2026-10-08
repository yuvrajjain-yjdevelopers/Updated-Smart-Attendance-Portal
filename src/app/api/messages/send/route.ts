import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendAndroidSms } from "@/lib/sms/androidGateway";
import { gatewayForSender } from "@/lib/sms/senderGateway";
import { shouldSkipDuplicate } from "@/lib/attendance";
import { DEFAULT_SMS_TEMPLATE, DEFAULT_WHATSAPP_TEMPLATE, renderTemplate } from "@/lib/messageTemplates";
import { normalizeIndianMobile } from "@/lib/phone";
export const dynamic = "force-dynamic";
const inputSchema = z.object({ studentIds: z.array(z.string()).min(1).max(500), channels: z.array(z.enum(["SMS", "WHATSAPP"])).min(1), sendAgain: z.boolean().default(false),manualSms:z.boolean().default(false) });
export async function POST(request: Request) {
  const sender = await currentUser();
  if (!sender) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (sender.role === "TEACHER" && !sender.canSend) return NextResponse.json({ error: "Sending is disabled for your account" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const testMode = (await db.setting.findUnique({ where: { key: "testMode" } }))?.value !== "false";
  const settings = Object.fromEntries((await db.setting.findMany()).map((setting) => [setting.key, setting.value]));
  const students = await db.student.findMany({ where: { id: { in: parsed.data.studentIds }, ...(sender.role === "TEACHER" ? { sectionId: sender.sectionId ?? "" } : {}) }, include: { section: true } });
  if (students.length !== parsed.data.studentIds.length) return NextResponse.json({ error: "One or more students are outside your permitted section" }, { status: 403 });
  if (parsed.data.channels.includes("SMS")&&!parsed.data.manualSms && (!sender.smsGatewayMode || !sender.smsGatewayUser || !sender.smsGatewayPassEnc || !sender.smsGatewaySenderNumber || sender.smsGatewayMode==="LOCAL"&&!sender.smsGatewayUrl)) return NextResponse.json({ error: "Set up your phone in Settings first", setupUrl: "/settings#phone-setup" }, { status: 400 });

  const output: Array<{ studentId: string; studentName: string; phone: string; channel: string; status: string; text: string;logId?:string }> = [];
  for (const student of students) {
    for (const channel of parsed.data.channels) {
      const messageDate = student.lastListDate ?? new Date();
      let parentNumber="";try{parentNumber=normalizeIndianMobile(student.parentMobile);}catch{/* Missing or invalid parent number is recorded as skipped below. */}
      const number = testMode ? settings.testNumber || "" : parentNumber ? `+91${parentNumber}` : "";
      if(testMode&&!number)return NextResponse.json({error:"Set a test number in Settings before sending in test mode"},{status:400});
      const subjectNames = (() => { try { return (JSON.parse(student.detainedSubjects) as Array<{ name?: string; code?: string }>).map((s) => s.name || s.code || ""); } catch { return []; } })();
      const template = channel === "SMS" ? settings.smsTemplate || DEFAULT_SMS_TEMPLATE : settings.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
      const text = `${testMode ? `[TEST for ${student.name}] ` : ""}${renderTemplate(template, { student_name: student.name, reg_no: student.regNo, section: student.section.name, avg: student.avgAtt ?? "—", detained_count: subjectNames.length, subjects: subjectNames.join("\n"), subjects_short: subjectNames.slice(0, 3).join(", ") + (subjectNames.length > 3 ? ` and ${subjectNames.length - 3} more` : ""), date: new Date().toLocaleDateString("en-GB"), sender_name: sender.name, sender_mobile: sender.mobile || "", sender_role: sender.role, college_name: settings.collegeName || "College", department: settings.department || "Department" })}`;
      const batch = await db.messageBatch.create({ data: { sectionId: student.sectionId, sentById: sender.id, senderName: sender.name, channels: channel, total: 1, testMode } });
      if(!parentNumber){await db.messageLog.create({data:{batchId:batch.id,studentId:student.id,sentById:sender.id,senderName:sender.name,channel,status:"SKIPPED",listDate:messageDate,toNumber:"",text,error:"Add parent mobile"}});output.push({studentId:student.id,studentName:student.name,phone:"",channel,status:"SKIPPED",text});continue;}
      if(channel==="SMS"&&(text.length>160||/[^\x00-\x7F]/.test(text))){await db.messageLog.create({data:{batchId:batch.id,studentId:student.id,sentById:sender.id,senderName:sender.name,channel,status:"FAILED",listDate:messageDate,toNumber:number,text,error:"SMS must be one ASCII message of 160 characters or fewer"}});output.push({studentId:student.id,studentName:student.name,phone:number,channel,status:"FAILED",text});continue;}
      const previous = await db.messageLog.findMany({ where: { studentId: student.id, channel, listDate: messageDate, status: { in: ["SENT", "OPENED"] } }, select: { status: true } });
      if (shouldSkipDuplicate(previous.map((item) => item.status), parsed.data.sendAgain)) {
        await db.messageLog.create({ data: { batchId: batch.id, studentId: student.id, sentById: sender.id, senderName: sender.name, channel, status: "SKIPPED", listDate: messageDate, toNumber: number, text } });
        output.push({ studentId: student.id, studentName: student.name, phone: number, channel, status: "SKIPPED", text });
        continue;
      }
      if (channel === "WHATSAPP" || (channel==="SMS"&&parsed.data.manualSms)) {
        const log = await db.messageLog.create({ data: { batchId: batch.id, studentId: student.id, sentById: sender.id, senderName: sender.name, channel, status: "OPENED", listDate: messageDate, toNumber: number, text } });
        output.push({ studentId: student.id, studentName: student.name, phone: number, channel, status: log.status, text, logId:log.id });
      } else {
        try {
          const userConfig = gatewayForSender(sender);
          await sendAndroidSms(userConfig, text, number);
          await db.messageLog.create({ data: { batchId: batch.id, studentId: student.id, sentById: sender.id, senderName: sender.name, channel, status: "SENT", listDate: messageDate, toNumber: number, text } });
          output.push({ studentId: student.id, studentName: student.name, phone: number, channel, status: "SENT", text });
        } catch (error) {
          const detail = error instanceof Error ? error.message : "SMS failed";
          await db.messageLog.create({ data: { batchId: batch.id, studentId: student.id, sentById: sender.id, senderName: sender.name, channel, status: "FAILED", error: detail, listDate: messageDate, toNumber: number, text } });
          output.push({ studentId: student.id, studentName: student.name, phone: number, channel, status: "FAILED", text });
        }
      }
    }
  }
  return NextResponse.json({ results: output, testMode });
}
