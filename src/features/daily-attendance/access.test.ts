import { describe, expect, it } from "vitest";
import { canAccessDailySection, canEditDailyDate, canViewDailySection } from "./access";
import { dateDistanceFromToday, parseAttendanceDate, todayInIndia } from "./date";

describe("daily attendance permissions and calendar dates", () => {
  it("scopes teachers to their own section and honors the marking switch", () => {
    expect(canAccessDailySection({ role: "TEACHER", sectionId: "A", canMarkDailyAttendance: true }, "A")).toBe(true);
    expect(canAccessDailySection({ role: "TEACHER", sectionId: "A", canMarkDailyAttendance: true }, "B")).toBe(false);
    expect(canAccessDailySection({ role: "TEACHER", sectionId: "A", canMarkDailyAttendance: false }, "A")).toBe(false);
    expect(canViewDailySection({ role: "TEACHER", sectionId: "A" }, "A")).toBe(true);
    expect(canAccessDailySection({ role: "HOD", sectionId: null, canMarkDailyAttendance: false }, "B")).toBe(true);
  });

  it("allows teachers today and yesterday by default and HODs any past day", () => {
    expect(canEditDailyDate({ role: "TEACHER" }, "2026-10-17", 1, "2026-10-17")).toBe(true);
    expect(canEditDailyDate({ role: "TEACHER" }, "2026-10-16", 1, "2026-10-17")).toBe(true);
    expect(canEditDailyDate({ role: "TEACHER" }, "2026-10-15", 1, "2026-10-17")).toBe(false);
    expect(canEditDailyDate({ role: "TEACHER" }, "2026-10-18", 1, "2026-10-17")).toBe(false);
    expect(canEditDailyDate({ role: "HOD" }, "2020-01-01", 0, "2026-10-17")).toBe(true);
    expect(canEditDailyDate({ role: "HOD" }, "2026-10-18", 0, "2026-10-17")).toBe(false);
  });

  it("uses Asia/Kolkata for today's date and validates calendar days", () => {
    expect(todayInIndia(new Date("2026-10-16T19:00:00.000Z"))).toBe("2026-10-17");
    expect(dateDistanceFromToday("2026-10-16", "2026-10-17")).toBe(1);
    expect(parseAttendanceDate("2026-02-30")).toBeNull();
    expect(parseAttendanceDate("2026-10-17")?.toISOString()).toBe("2026-10-17T00:00:00.000Z");
  });
});
