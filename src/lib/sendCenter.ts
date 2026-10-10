import { normalizeIndianMobile } from "@/lib/phone";
export function buildSmsUrl(phone: string, text: string, platform: "android" | "iphone" = "android") {
  const normalized = normalizeIndianMobile(phone);
  const separator = platform === "iphone" ? "&" : "?";
  return `sms:+91${normalized}${separator}body=${encodeURIComponent(text)}`;
}
export function buildWhatsAppUrl(phone: string, text: string, platform: "desktop" | "phone") {
  const digits = `91${normalizeIndianMobile(phone)}`;
  const query = `phone=${digits}&text=${encodeURIComponent(text)}`;
  return platform === "desktop" ? `https://web.whatsapp.com/send?${query}` : `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
export const GOOGLE_MESSAGES_URL = "https://messages.google.com/web/conversations/new";
export function resolveRecipient(parentNumber: string | null, testMode: boolean, testNumber: string) {
  const value = testMode ? testNumber : parentNumber || "";
  try { return `91${normalizeIndianMobile(value)}`; } catch { return ""; }
}
export function canSendForSection(role: "HOD" | "TEACHER", canSend: boolean, assignedSection: string | null, requestedSection: string) {
  return role === "HOD" || (canSend && assignedSection === requestedSection);
}
