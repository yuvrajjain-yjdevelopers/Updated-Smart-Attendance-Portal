export const ACTIVE_SESSION_STATUSES = ["PREPARED", "IN_PROGRESS", "PAUSED_SETUP"] as const;
export const CONNECTION_EXPIRY_MS = 12 * 60 * 60 * 1000;

export function connectionIsConfirmed(confirmedAt: Date | string | null | undefined, now = Date.now()) {
  if (!confirmedAt) return false;
  const time = confirmedAt instanceof Date ? confirmedAt.getTime() : new Date(confirmedAt).getTime();
  return Number.isFinite(time) && now - time >= 0 && now - time < CONNECTION_EXPIRY_MS;
}

export function canAccessSendSession(user: { id: string; role: string; sectionId: string | null }, session: { userId: string; sectionId: string }) {
  return user.id === session.userId && (user.role !== "TEACHER" || user.sectionId === session.sectionId);
}

export function nextPendingIndex(statuses: string[], currentIndex: number) {
  for (let index = Math.max(0, currentIndex); index < statuses.length; index++) {
    if (statuses[index] === "PENDING" || statuses[index] === "OPENED" || statuses[index] === "FAILED") return index;
  }
  return statuses.length;
}

export function initialSendState(confirmed: boolean, statuses: string[]) {
  return { status: confirmed ? "IN_PROGRESS" as const : "PAUSED_SETUP" as const, currentIndex: nextPendingIndex(statuses, 0) };
}

export function queueCursorAtSavedIndex(statuses: string[], currentIndex: number) {
  return statuses.slice(0, Math.max(0, currentIndex)).filter(status => status !== "EXCLUDED").length;
}

export function pauseForSetup(currentIndex: number) { return { status: "PAUSED_SETUP" as const, currentIndex }; }
export function resumeAfterSetup(currentIndex: number) { return { status: "IN_PROGRESS" as const, currentIndex }; }
