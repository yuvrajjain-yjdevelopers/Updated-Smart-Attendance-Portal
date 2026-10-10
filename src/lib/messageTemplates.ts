export const DEFAULT_SMS_TEMPLATE = "Dear Parent, {student_name} (Reg {reg_no}) has {avg}% attendance, below 75%.{?subjects} Detained in {detained_count} subjects.{/subjects} Contact {sender_name}. -{college_name}";
export const DEFAULT_WHATSAPP_TEMPLATE = "Dear Parent,\n\nName: {student_name}\nReg No: {reg_no}\nSection: {section}\nAttendance: {avg}%\n{?subjects}Detained subjects:\n{subjects}\n\n{/subjects}Please contact {sender_name} ({sender_mobile}).\n\nRegards,\n{sender_name}, {department}\n{college_name}";

export function renderTemplate(template: string, values: Record<string, string | number | null | undefined>) {
  const conditional = template.replace(/\{\?([a-z_]+)\}([\s\S]*?)\{\/\1\}/gi, (_, key: string, content: string) => values[key] !== null && values[key] !== undefined && String(values[key]).trim() !== "" && String(values[key]) !== "0" ? content : "");
  return conditional.replace(/\{([a-z_]+)\}/gi, (_, key: string) => {
    const value = values[key];
    if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) return "";
    const rendered = String(value);
    return /^(?:null|undefined|nan|—)$/i.test(rendered.trim()) ? "" : rendered;
  }).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function toAsciiSms(value: string) {
  return value.normalize("NFKD").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[^\x00-\x7F]/g, "").replace(/[ \t]{2,}/g, " ").trim();
}
