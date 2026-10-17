import { describe, expect, it, vi } from "vitest";
import { buildPreparedText, buildPreparedTextBatch, canReusePreparedMessage } from "@/lib/preparedMessages";
import { DEFAULT_TRILINGUAL_WHATSAPP_TEMPLATE } from "@/lib/messageTemplates";

describe("on-demand message preparation", () => {
  it("preserves detention message wording and sent-message reuse rules", () => {
    const template = "ENGLISH\n{student_name} {avg}%\n\nहिन्दी\n{student_name} {avg}%\n\nमराठी\n{student_name} {avg}%";
    const text = buildPreparedText({ template, studentName: "Asha Patil", regNo: "CS101", section: "CS-A", avg: 64.5, subjects: [], date: new Date("2026-10-10T00:00:00.000Z"), senderName: "Teacher A", senderMobile: "9876543210", collegeName: "City College", department: "Computer Science", testMode: false, channel: "WHATSAPP" });
    expect(text).toBe("ENGLISH\nAsha Patil 64.5%\n\nहिन्दी\nAsha Patil 64.5%\n\nमराठी\nAsha Patil 64.5%");
    expect(canReusePreparedMessage({ status: "READY", sourceFingerprint: "same" }, "same")).toBe(true);
    expect(canReusePreparedMessage({ status: "SENT", sourceFingerprint: "same" }, "same")).toBe(false);
  });

  it("regenerates a deliberately prepared resend after an earlier open or send", () => {
    expect(canReusePreparedMessage({ status: "READY", sourceFingerprint: "same" }, "same")).toBe(true);
    expect(canReusePreparedMessage({ status: "SENT", sourceFingerprint: "same" }, "same")).toBe(false);
    expect(canReusePreparedMessage({ status: "OPENED", sourceFingerprint: "same" }, "same")).toBe(false);
  });

  it("renders 300 WhatsApp messages in memory in under one second without readiness or network checks", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const records = Array.from({ length: 300 }, (_, index) => ({
      template: DEFAULT_TRILINGUAL_WHATSAPP_TEMPLATE,
      studentName: `Student ${index + 1}`,
      regNo: `REG${String(index + 1).padStart(4, "0")}`,
      section: "Section A",
      avg: 65,
      subjects: [],
      date: new Date("2026-10-10T00:00:00.000Z"),
      senderName: "Teacher A",
      senderMobile: "9876543210",
      collegeName: "Example College",
      department: "Computer Science",
      testMode: false,
      channel: "WHATSAPP" as const,
    }));
    const started = performance.now();
    const messages = buildPreparedTextBatch(records);
    const elapsed = performance.now() - started;
    expect(messages).toHaveLength(300);
    expect(messages[0]).toContain("Student 1");
    expect(messages[0]).not.toContain("Detained subjects:");
    expect(elapsed).toBeLessThan(1000);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
