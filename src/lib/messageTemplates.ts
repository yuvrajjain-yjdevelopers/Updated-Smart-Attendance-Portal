export const DEFAULT_SMS_TEMPLATE = "Dear Parent, your ward {student_name} (Reg {reg_no}) has overall attendance of {avg}%, below the required 75%, as of {date}. Detained subjects: {subjects_short}. Please contact {sender_name} ({sender_mobile}). - {college_name}";
export const DEFAULT_WHATSAPP_TEMPLATE = "Dear Parent,\n\nThis is to inform you that your ward has low attendance.\n\nName: {student_name}\nReg No: {reg_no}\nSection: {section}\nOverall Attendance: {avg}%\n\nDetained subjects:\n{subjects}\n\nThe minimum required attendance is 75%. Please contact {sender_name} ({sender_mobile}) for any queries.\n\nRegards,\n{sender_name}, {department}\n{college_name}";

export function renderTemplate(template: string, values: Record<string, string | number | null | undefined>) {
  return template.replace(/\{([a-z_]+)\}/gi, (_, key: string) => String(values[key] ?? ""));
}
