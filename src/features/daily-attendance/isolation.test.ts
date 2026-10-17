import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("daily attendance isolation guardrails", () => {
  it("keeps marking and editing routes away from detention fields and tables", async () => {
    const source = await readFile("src/app/api/daily-attendance/route.ts", "utf8");
    for (const forbidden of ["avgAtt", "isDetained", "detainedSubjects", "DetentionUpload", "DetentionEntry"]) expect(source).not.toContain(forbidden);
  });

  it("keeps detention list application away from daily attendance records", async () => {
    const source = await readFile("src/app/api/sections/[id]/detention/route.ts", "utf8");
    expect(source).not.toMatch(/dailyAttendance/i);
  });

  it("keeps absence preparation on daily attendance data without reading detention averages", async () => {
    const source = await readFile("src/features/daily-attendance/preparation.ts", "utf8");
    expect(source).toContain("db.dailyAttendance.findUnique");
    expect(source).toContain('kind: "ABSENCE"');
    for (const forbidden of ["avgAtt", "totalAttendancePct", "isDetained", "detainedSubjects", "detentionAverage"]) expect(source).not.toContain(forbidden);
  });

  it("keeps the detention preparation query isolated from daily attendance", async () => {
    const source = await readFile("src/lib/preparedMessages.ts", "utf8");
    expect(source).not.toMatch(/dailyAttendance/i);
    expect(source).toContain('kind: "DETENTION"');
  });

  it("preserves unique daily section and day and student and attendance constraints", async () => {
    const schema = await readFile("prisma/schema.prisma", "utf8");
    expect(schema).toContain("@@unique([sectionId, date])");
    expect(schema).toContain("@@unique([dailyAttendanceId, studentId])");
    expect(schema).toContain("@@unique([studentId, senderId, channel, kind])");
  });
});
