import { describe, expect, it } from "vitest";
import { absentDaysThisMonth, absenceMessageIsWithinSmsLimit, absenceRecipientsNotYetMessaged, buildAbsenceMessage, buildAbsenceMessageBatch, DEFAULT_ABSENCE_SMS_TEMPLATE, DEFAULT_ABSENCE_WHATSAPP_TEMPLATE } from "./messages";
import { getSmsMetrics } from "@/lib/messageTemplates";

describe("absence messages", () => {
  const values = { studentName: "Asha Patil", regNo: "CS101", section: "CS-A", date: "Saturday, 17 October 2026", dateHi: "शनिवार, 17 अक्तूबर 2026", dateMr: "शनिवार, १७ ऑक्टोबर, २०२६", senderName: "Teacher A", senderMobile: "9876543210", department: "Computer Science", collegeName: "City College" };

  it("fills absence placeholders without attendance percentages or detention details", () => {
    const text = buildAbsenceMessage("Dear Parent, {student_name} {reg_no} {section} {date}. Contact {sender_name}, {sender_mobile}. {department} {college_name} {avg} {subjects} detained 75%", values, "WHATSAPP", false);
    expect(text).toContain("Asha Patil CS101 CS-A Saturday, 17 October 2026");
    expect(text).toContain("Teacher A, 9876543210");
    expect(text).toContain("Computer Science City College");
    expect(text).not.toMatch(/%|attendance|detain|\{(?:avg|subjects)\}/i);
  });

  it("keeps the default SMS within one part and marks test messages", () => {
    const text = buildAbsenceMessage("Dear Parent, {student_name} (Reg {reg_no}) was absent on {date}. Contact {sender_name}. -{college_name}", values, "SMS", true);
    expect(text).toMatch(/^\[TEST for Asha Patil\]/);
    expect(text).toMatch(/^[\x00-\x7F]*$/);
    expect(absenceMessageIsWithinSmsLimit(text)).toBe(true);
  });

  it("prevents duplicate sends unless the sender chooses send again", () => {
    expect(absenceRecipientsNotYetMessaged(["a", "b", "c"], ["b"], false)).toEqual(["a", "c"]);
    expect(absenceRecipientsNotYetMessaged(["a", "b"], ["b"], true)).toEqual(["a", "b"]);
  });

  it("counts only absent days and ignores holiday entries", () => {
    expect(absentDaysThisMonth([{ status: "ABSENT", isHoliday: false }, { status: "ABSENT", isHoliday: true }, { status: "PRESENT", isHoliday: false }])).toBe(1);
  });

  it("uses the requested three language blocks for both absence channels", () => {
    expect(DEFAULT_ABSENCE_WHATSAPP_TEMPLATE).toBe(DEFAULT_ABSENCE_SMS_TEMPLATE);
    for (const template of [DEFAULT_ABSENCE_SMS_TEMPLATE, DEFAULT_ABSENCE_WHATSAPP_TEMPLATE]) {
      expect(template).toContain("{student_name} (Registration No. {reg_no}) was absent today ({date}).");
      expect(template).toContain("आज अनुपस्थित थे/थीं ({date_hi})");
      expect(template).toContain("आज अनुपस्थित होते/होत्या ({date_mr})");
    }
    for (const template of [DEFAULT_ABSENCE_SMS_TEMPLATE, DEFAULT_ABSENCE_WHATSAPP_TEMPLATE]) expect(template).not.toMatch(/\{(?:avg|subjects|detained_count)\}|\d+(?:\.\d+)?%/i);
  });

  it("keeps Hindi and Marathi in SMS and uses Unicode part counting", () => {
    const text = buildAbsenceMessage(DEFAULT_ABSENCE_SMS_TEMPLATE, values, "SMS", false);
    expect(text).toContain("आज अनुपस्थित थे/थीं");
    expect(text).toContain("आज अनुपस्थित होते/होत्या");
    expect(text).toContain("Saturday, 17 October 2026");
    expect(getSmsMetrics(text).encoding).toBe("Unicode");
    expect(getSmsMetrics("अ".repeat(70)).parts).toBe(1);
    expect(getSmsMetrics("अ".repeat(71)).parts).toBe(2);
  });

  it("renders 300 absence messages under one second with one compiled template", () => {
    const inputs = Array.from({ length: 300 }, (_, index) => ({ ...values, studentName: `Student ${index + 1}`, regNo: `REG${index + 1}` }));
    const started = performance.now();
    const messages = buildAbsenceMessageBatch(DEFAULT_ABSENCE_WHATSAPP_TEMPLATE, inputs, "WHATSAPP", false);
    expect(messages).toHaveLength(300);
    expect(messages[299]).toContain("Student 300");
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
