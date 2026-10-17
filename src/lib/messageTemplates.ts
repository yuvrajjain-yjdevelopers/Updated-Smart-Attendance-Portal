export const MESSAGE_LANGUAGES = ["en", "hi", "mr"] as const;
export type MessageLanguage = (typeof MESSAGE_LANGUAGES)[number];
export const MESSAGE_LANGUAGE_LABELS: Record<MessageLanguage, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी",
};

export const DEFAULT_SMS_TEMPLATES: Record<MessageLanguage, string> = {
  en: "Dear Parent, {student_name} (Reg {reg_no}) has {avg}% attendance, below 75%.{?subjects} Detained in {detained_count} subjects.{/subjects} Please contact {sender_name} ({sender_mobile}). -{college_name}",
  hi: "प्रिय अभिभावक, {student_name} (पंजीकरण {reg_no}) की उपस्थिति {avg}% है, 75% से कम।{?subjects} {detained_count} विषयों में कमी है।{/subjects} संपर्क: {sender_name} ({sender_mobile})। -{college_name}",
  mr: "प्रिय पालक, {student_name} (नोंदणी {reg_no}) यांची उपस्थिती {avg}% आहे, 75% पेक्षा कमी.{?subjects} {detained_count} विषयांत कमी आहे.{/subjects} संपर्क: {sender_name} ({sender_mobile}). -{college_name}",
};

export const DEFAULT_WHATSAPP_TEMPLATES: Record<MessageLanguage, string> = {
  en: "Dear Parent,\n\nName: {student_name}\nReg No: {reg_no}\nSection: {section}\nAttendance: {avg}% (below 75%)\nPlease contact {sender_name} ({sender_mobile}).\n\nRegards,\n{sender_name}, {department}\n{college_name}",
  hi: "प्रिय अभिभावक,\n\nविद्यार्थी: {student_name}\nपंजीकरण नंबर: {reg_no}\nसेक्शन: {section}\nउपस्थिति: {avg}% (75% से कम)\nकृपया {sender_name} ({sender_mobile}) से संपर्क करें।\n\nसादर,\n{sender_name}, {department}\n{college_name}",
  mr: "प्रिय पालक,\n\nविद्यार्थी: {student_name}\nनोंदणी क्रमांक: {reg_no}\nविभाग: {section}\nउपस्थिती: {avg}% (75% पेक्षा कमी)\nकृपया {sender_name} ({sender_mobile}) यांच्याशी संपर्क साधा.\n\nआपला,\n{sender_name}, {department}\n{college_name}",
};

// Keep each complete language block in the order the sender requested.
export const DEFAULT_TRILINGUAL_SMS_TEMPLATE = `ENGLISH\n${DEFAULT_SMS_TEMPLATES.en}\n\nहिन्दी\n${DEFAULT_SMS_TEMPLATES.hi}\n\nमराठी\n${DEFAULT_SMS_TEMPLATES.mr}`;
export const DEFAULT_TRILINGUAL_WHATSAPP_TEMPLATE = `ENGLISH\n${DEFAULT_WHATSAPP_TEMPLATES.en}\n\nहिन्दी\n${DEFAULT_WHATSAPP_TEMPLATES.hi}\n\nमराठी\n${DEFAULT_WHATSAPP_TEMPLATES.mr}`;

export function getTrilingualSmsTemplate(settings: Record<string, string | undefined>) {
  return settings.smsTemplateAllLanguages || DEFAULT_TRILINGUAL_SMS_TEMPLATE;
}

export function getTrilingualWhatsAppTemplate(settings: Record<string, string | undefined>) {
  return sanitizeWhatsAppTemplate(settings.whatsappTemplateAllLanguages || DEFAULT_TRILINGUAL_WHATSAPP_TEMPLATE);
}

/** Remove old subject sections from saved templates and localize the attendance sentence. */
export function sanitizeWhatsAppTemplate(template: string) {
  let cleaned = template
    .replace(/\{\?subjects\}[\s\S]*?\{\/subjects\}/gi, "")
    .replace(/(?:Detained subjects|कम उपस्थिति वाले विषय|कमी उपस्थितीचे विषय)\s*:\s*\n?\s*\{subjects\}\s*/gi, "")
    .replace(/^.*(?:\{subjects\}|\{detained_count\}).*$/gim, "")
    .replace(/^\s*\{subjects\}\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n");

  // Upgrade the previously supplied wording even when it was already saved in Settings.
  cleaned = cleaned.replace(/Attendance:\s*(?:\{avg\}%\s*)?(?:His\/Her attendance is less than 75%|below 75%)?/gi, "Attendance: {avg}% (below 75%)");
  cleaned = cleaned.replace(/उपस्थिति:\s*(?:\{avg\}%\s*)?(?:His\/Her attendance is less than 75%|75% से कम)?/gi, "उपस्थिति: {avg}% (75% से कम)");
  cleaned = cleaned.replace(/उपस्थिती:\s*(?:\{avg\}%\s*)?(?:His\/Her attendance is less than 75%|75% पेक्षा कमी)?/gi, "उपस्थिती: {avg}% (75% पेक्षा कमी)");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

// Backwards-compatible English names for existing callers and saved settings.
export const DEFAULT_SMS_TEMPLATE = DEFAULT_SMS_TEMPLATES.en;
export const DEFAULT_WHATSAPP_TEMPLATE = DEFAULT_WHATSAPP_TEMPLATES.en;

export function getSmsTemplateKey(language: MessageLanguage) {
  return language === "en" ? "smsTemplate" : language === "hi" ? "smsTemplateHindi" : "smsTemplateMarathi";
}

export function getWhatsAppTemplateKey(language: MessageLanguage) {
  return language === "en" ? "whatsappTemplate" : language === "hi" ? "whatsappTemplateHindi" : "whatsappTemplateMarathi";
}

export function getSmsTemplate(settings: Record<string, string | undefined>, language: MessageLanguage) {
  return settings[getSmsTemplateKey(language)] || DEFAULT_SMS_TEMPLATES[language];
}

export function getWhatsAppTemplate(settings: Record<string, string | undefined>, language: MessageLanguage) {
  return settings[getWhatsAppTemplateKey(language)] || DEFAULT_WHATSAPP_TEMPLATES[language];
}

export const MAX_SMS_PARTS = 10;
export type SmsMetrics = { encoding: "GSM-7" | "Unicode"; characters: number; parts: number; limit: number };

const GSM7_BASIC = new Set(Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"));
const GSM7_EXTENSION = new Set(Array.from("^{}\\[~]|€\f"));

export function getSmsMetrics(text: string): SmsMetrics {
  let gsmLength = 0;
  let gsm = true;
  for (const character of text) {
    if (GSM7_BASIC.has(character)) gsmLength += 1;
    else if (GSM7_EXTENSION.has(character)) gsmLength += 2;
    else { gsm = false; break; }
  }
  const characters = gsm ? gsmLength : text.length;
  const singleLimit = gsm ? 160 : 70;
  const multipartLimit = gsm ? 153 : 67;
  return { encoding: gsm ? "GSM-7" : "Unicode", characters, parts: characters <= singleLimit ? 1 : Math.ceil(characters / multipartLimit), limit: multipartLimit * MAX_SMS_PARTS };
}

export function renderTemplate(template: string, values: Record<string, string | number | null | undefined>) {
  return compileTemplate(template)(values);
}

export function compileTemplate(template: string) {
  const conditionalPattern = /\{\?([a-z_]+)\}([\s\S]*?)\{\/\1\}/gi;
  const placeholderPattern = /\{([a-z_]+)\}/gi;
  return (values: Record<string, string | number | null | undefined>) => template.replace(conditionalPattern, (_whole, key: string, content: string) => {
    const value = values[key];
    return value !== null && value !== undefined && String(value).trim() !== "" && String(value) !== "0" ? content : "";
  }).replace(placeholderPattern, (_whole, key: string) => {
    const value = values[key];
    if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) return "";
    const rendered = String(value);
    return /^(?:null|undefined|nan|—)$/i.test(rendered.trim()) ? "" : rendered;
  }).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function toAsciiSms(value: string) {
  return value.normalize("NFKD").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[^\x00-\x7F]/g, "").replace(/[ \t]{2,}/g, " ").trim();
}

export function normalizeSmsText(value: string) {
  return value.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[ \t]{2,}/g, " ").trim();
}
