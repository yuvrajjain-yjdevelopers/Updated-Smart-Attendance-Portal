import { describe, expect, it, vi } from "vitest";
import { buildPreparedTextBatch } from "@/lib/preparedMessages";
import { DEFAULT_TRILINGUAL_WHATSAPP_TEMPLATE } from "@/lib/messageTemplates";

describe("on-demand message preparation", () => {
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
