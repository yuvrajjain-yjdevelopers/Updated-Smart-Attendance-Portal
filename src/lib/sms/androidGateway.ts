import type { SmsGatewayMode } from "@prisma/client";
import { toInternationalMobile } from "@/lib/phone";

/** Verify these values against the installed SMS Gateway for Android version.
 * Current docs: https://github.com/capcom6/android-sms-gateway
 */
export const ANDROID_GATEWAY = {
  local: {
    defaultBaseUrl: "http://192.168.1.50:8080",
    path: "/message",
    method: "POST",
    payload: (message: string, phoneNumber: string) => ({
      textMessage: { text: message },
      phoneNumbers: [phoneNumber],
    }),
  },
  cloud: {
    baseUrl: "https://api.sms-gate.app",
    path: "/3rdparty/v1/message",
    method: "POST",
    payload: (message: string, phoneNumber: string) => ({
      textMessage: { text: message },
      phoneNumbers: [phoneNumber],
    }),
  },
} as const;

export type AndroidGatewayConfig = {
  mode: SmsGatewayMode;
  baseUrl?: string | null;
  username: string;
  password: string;
};

export async function sendAndroidSms(
  config: AndroidGatewayConfig,
  message: string,
  phoneNumber: string,
) {
  const mode = config.mode === "CLOUD" ? ANDROID_GATEWAY.cloud : ANDROID_GATEWAY.local;
  const baseUrl = (config.mode === "CLOUD" ? ANDROID_GATEWAY.cloud.baseUrl : config.baseUrl)?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("Gateway base URL is required");
  const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  const response = await fetch(`${baseUrl}${mode.path}`, {
    method: mode.method,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(mode.payload(message, toInternationalMobile(phoneNumber))),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Gateway returned ${response.status}: ${await response.text()}`);
  return response.json().catch(() => ({}));
}
