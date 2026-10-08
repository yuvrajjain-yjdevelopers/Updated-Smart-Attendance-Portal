import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { sendAndroidSms } from "@/lib/sms/androidGateway";
import { DEFAULT_SMS_TEMPLATE, DEFAULT_WHATSAPP_TEMPLATE, renderTemplate } from "@/lib/messageTemplates";
export const dynamic = "force-dynamic";
const inputSchema = z.object({ studentIds: z.array(z.string()).min(1).max(500), channels: z.array(z.enum(["SMS", "WHATSAPP"])).min(1), testNumber: z.string().optional() });
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
  if (parsed.data.channels.includes("SMS") && (!sender.smsGatewayMode || !sender.smsGatewayUser || !sender.smsGatewayPassEnc || !sender.smsGatewaySenderNumber)) return NextResponse.json({ error: "Set up your phone in Settings first", setupUrl: "/settings#phone-setup" }, { status: 400 });

  const output: Array<{ studentId: string; channel: string; status: string; text: string }> = [];
  for (const student of students) {
    for (const channel of parsed.data.channels) {
      const number = testMode ? (parsed.data.testNumber || settings.testNumber || "") : student.parentMobile;
      const subjectNames = (() => { try { return (JSON.parse(student.detainedSubjects) as Array<{ name?: string; code?: string }>).map((s) => s.name || s.code || ""); } catch { return []; } })();
      const template = channel === "SMS" ? settings.smsTemplate || DEFAULT_SMS_TEMPLATE : settings.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
      const text = `${testMode ? `[TEST for ${student.name}] ` : ""}${renderTemplate(template, { student_name: student.name, reg_no: student.regNo, section: student.section.name, avg: student.avgAtt ?? "—", detained_count: subjectNames.length, subjects: subjectNames.join("\n"), subjects_short: subjectNames.slice(0, 3).join(", ") + (subjectNames.length > 3 ? ` and ${subjectNames.length - 3} more` : ""), date: new Date().toLocaleDateString("en-GB"), sender_name: sender.name, sender_mobile: sender.mobile || "", sender_role: sender.role, college_name: settings.collegeName || "College", department: settings.department || "Department" })}`;
      const batch = await db.messageBatch.create({ data: { sectionId: student.sectionId, sentById: sender.id, senderName: sender.name, channels: channel, total: 1, testMode } });
      if (channel === "WHATSAPP") {
        const log = await db.messageLog.create({ data: { batchId: batch.id, studentId: student.id, sentById: sender.id, senderName: sender.name, channel, status: "OPENED", listDate: new Date(), toNumber: number, text } });
        output.push({ studentId: student.id, channel, status: log.status, text });
      } else {
        try {
          const userConfig = { mode: sender.smsGatewayMode!, baseUrl: sender.smsGatewayUrl, username: sender.smsGatewayUser!, password: decryptSecret(sender.smsGatewayPassEnc!) };
          await sendAndroidSms(userConfig, text, number);
          await db.messageLog.create({ data: { batchId: batch.id, studentId: student.id, sentById: sender.id, senderName: sender.name, channel, status: "SENT", listDate: new Date(), toNumber: number, text } });
          output.push({ studentId: student.id, channel, status: "SENT", text });
        } catch (error) {
          const detail = error instanceof Error ? error.message : "SMS failed";
          await db.messageLog.create({ data: { batchId: batch.id, studentId: student.id, sentById: sender.id, senderName: sender.name, channel, status: "FAILED", error: detail, listDate: new Date(), toNumber: number, text } });
          output.push({ studentId: student.id, channel, status: "FAILED", text });
        }
      }
    }
  }
  return NextResponse.json({ results: output, testMode });
}
