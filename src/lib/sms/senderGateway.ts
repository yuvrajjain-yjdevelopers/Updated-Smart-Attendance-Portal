import type { SmsGatewayMode, User } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import type { AndroidGatewayConfig } from "@/lib/sms/androidGateway";

export function gatewayForSender(sender: Pick<User, "smsGatewayMode" | "smsGatewayUrl" | "smsGatewayUser" | "smsGatewayPassEnc">): AndroidGatewayConfig {
  if (!sender.smsGatewayMode || !sender.smsGatewayUser || !sender.smsGatewayPassEnc) throw new Error("Set up your phone in Settings first");
  return { mode: sender.smsGatewayMode as SmsGatewayMode, baseUrl: sender.smsGatewayUrl, username: sender.smsGatewayUser, password: decryptSecret(sender.smsGatewayPassEnc) };
}

export function publicGatewayStatus(sender: Pick<User, "smsGatewayMode" | "smsGatewayUrl" | "smsGatewayUser" | "smsGatewayPassEnc" | "smsGatewaySenderNumber" | "smsGatewayLastTestAt" | "smsGatewayLastSuccessfulTestAt" | "smsGatewayLastTestOk">) {
  return { configured: Boolean(sender.smsGatewayMode && sender.smsGatewayUser && sender.smsGatewayPassEnc && sender.smsGatewaySenderNumber && (sender.smsGatewayMode === "CLOUD" || sender.smsGatewayUrl)), mode: sender.smsGatewayMode, baseUrl: sender.smsGatewayUrl, senderNumber: sender.smsGatewaySenderNumber, lastTestAt: sender.smsGatewayLastTestAt, lastSuccessfulTestAt: sender.smsGatewayLastSuccessfulTestAt, lastTestOk: sender.smsGatewayLastTestOk };
}
