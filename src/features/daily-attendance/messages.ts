import { compileTemplate, getSmsMetrics, normalizeSmsText } from "@/lib/messageTemplates";

export const DEFAULT_ABSENCE_SMS_TEMPLATE = `ENGLISH\n{student_name} (Registration No. {reg_no}) was absent today ({date}).\n\nहिन्दी\n{student_name} (पंजीकरण संख्या {reg_no}) आज अनुपस्थित थे/थीं ({date_hi})।\n\nमराठी\n{student_name} (नोंदणी क्रमांक {reg_no}) आज अनुपस्थित होते/होत्या ({date_mr}).`;
export const DEFAULT_ABSENCE_WHATSAPP_TEMPLATE = DEFAULT_ABSENCE_SMS_TEMPLATE;

// Queued rows can belong to sessions cancelled before sending. Only confirmed
// sent/opened statuses should suppress generating a fresh message preview.
export const ABSENCE_DUPLICATE_STATUSES = ["SENT", "OPENED", "SENT_BY_USER"] as const;

export function ensureTrilingualAbsenceTemplate(saved: string | undefined, fallback: string) {
  if (!saved?.trim()) return fallback;
  const placeholders = [...saved.matchAll(/\{\s*([a-z_]+)\s*\}/gi)].map(match => match[1].toLowerCase());
  const allowed = new Set(["student_name", "reg_no", "date", "date_hi", "date_mr"]);
  const hasThreeLanguages = /^ENGLISH\s*$/m.test(saved) && /^हिन्दी\s*$/m.test(saved) && /^मराठी\s*$/m.test(saved);
  const hasLocalizedDates = placeholders.includes("date_hi") && placeholders.includes("date_mr");
  if (placeholders.some(placeholder => !allowed.has(placeholder))) return fallback;
  if (hasThreeLanguages) return hasLocalizedDates ? saved : fallback;
  const hindi = fallback.match(/^हिन्दी\s*\n([\s\S]*?)(?=\n\s*मराठी\s*$)/m)?.[1]?.trim() || "";
  const marathi = fallback.match(/^मराठी\s*\n([\s\S]*)$/m)?.[1]?.trim() || "";
  return `ENGLISH\n${saved.trim()}\n\nहिन्दी\n${hindi}\n\nमराठी\n${marathi}`;
}

export type AbsenceTemplateValues = {
  studentName: string;
  regNo: string;
  section: string;
  date: string;
  dateHi: string;
  dateMr: string;
  senderName: string;
  senderMobile: string;
  department: string;
  collegeName: string;
};

export function formatAbsenceDate(date: Date, locale: "en-GB" | "hi-IN" | "mr-IN") {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function sanitizeAbsenceTemplate(template: string) {
  return template
    .replace(/\{\s*(?:avg|subjects|subjects_short|detained_count)\s*\}/gi, "")
    .replace(/\b(?:attendance percentage|detained subjects|detained)\b|कम उपस्थिति वाले विषय|कमी उपस्थितीचे विषय|औसत उपस्थिति|सरासरी उपस्थिती/gi, "")
    .replace(/\d+(?:\.\d+)?%/g, "");
}

export function buildAbsenceMessage(template: string, values: AbsenceTemplateValues, channel: "SMS" | "WHATSAPP", testMode: boolean, renderer?: ReturnType<typeof compileTemplate>) {
  const render = renderer || compileTemplate(sanitizeAbsenceTemplate(template));
  let text = render({
    student_name: values.studentName,
    reg_no: values.regNo,
    section: values.section,
    date: values.date,
    date_hi: values.dateHi,
    date_mr: values.dateMr,
    sender_name: values.senderName,
    sender_mobile: values.senderMobile,
    department: values.department,
    college_name: values.collegeName,
  });
  if (channel === "SMS") text = normalizeSmsText(text);
  if (testMode) text = `[TEST for ${values.studentName}] ${text}`;
  return text;
}

export function buildAbsenceMessageBatch(template: string, values: AbsenceTemplateValues[], channel: "SMS" | "WHATSAPP", testMode: boolean) {
  const renderer = compileTemplate(sanitizeAbsenceTemplate(template));
  return values.map(value => buildAbsenceMessage(template, value, channel, testMode, renderer));
}

export function absenceMessageIsWithinSmsLimit(text: string) {
  return getSmsMetrics(text).parts <= 10;
}

export function absentDaysThisMonth(rows: Array<{ status: string; isHoliday: boolean }>) {
  return rows.filter(row => row.status === "ABSENT" && !row.isHoliday).length;
}

export function absenceRecipientsNotYetMessaged(studentIds: string[], alreadyMessagedIds: string[], sendAgain: boolean) {
  if (sendAgain) return studentIds;
  const already = new Set(alreadyMessagedIds);
  return studentIds.filter(id => !already.has(id));
}
