import { describe, expect, it } from "vitest";
import { CONNECTION_EXPIRY_MS, canAccessSendSession, connectionIsConfirmed, initialSendState, nextPendingIndex, pauseForSetup, queueCursorAtSavedIndex, resumeAfterSetup } from "@/lib/sendSessions";

describe("resumable send session rules", () => {
  it("pauses setup-required sessions before opening the first eligible student", () => {
    expect(initialSendState(false, ["EXCLUDED", "PENDING", "PENDING"])).toEqual({ status: "PAUSED_SETUP", currentIndex: 1 });
    expect(initialSendState(true, ["PENDING", "PENDING"]).status).toBe("IN_PROGRESS");
  });

  it("keeps the same student current while setup is unresolved and skips exclusions when resuming", () => {
    const statuses = ["SENT_BY_USER", "PENDING", "EXCLUDED", "PENDING"];
    const currentIndex = nextPendingIndex(statuses, 1);
    expect(currentIndex).toBe(1);
    expect(queueCursorAtSavedIndex(statuses, currentIndex)).toBe(1);
    expect(pauseForSetup(currentIndex)).toEqual({ status: "PAUSED_SETUP", currentIndex: 1 });
    expect(resumeAfterSetup(currentIndex)).toEqual({ status: "IN_PROGRESS", currentIndex: 1 });
  });

  it("expires user-confirmed links after twelve hours", () => {
    const now = Date.now();
    expect(connectionIsConfirmed(new Date(now - CONNECTION_EXPIRY_MS + 1000), now)).toBe(true);
    expect(connectionIsConfirmed(new Date(now - CONNECTION_EXPIRY_MS - 1), now)).toBe(false);
    expect(connectionIsConfirmed(null, now)).toBe(false);
  });

  it("does not allow teachers to read another user's or another section's session", () => {
    const session = { userId: "teacher-a", sectionId: "section-a" };
    expect(canAccessSendSession({ id: "teacher-a", role: "TEACHER", sectionId: "section-a" }, session)).toBe(true);
    expect(canAccessSendSession({ id: "teacher-b", role: "TEACHER", sectionId: "section-b" }, session)).toBe(false);
    expect(canAccessSendSession({ id: "teacher-a", role: "TEACHER", sectionId: "section-b" }, session)).toBe(false);
  });
});
