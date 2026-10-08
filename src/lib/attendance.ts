export function isDetained(avgAttendance: number, threshold = 75) { return avgAttendance < threshold; }
export function shouldSkipDuplicate(previousStatuses: string[], sendAgain = false) { return !sendAgain && previousStatuses.some((status) => status === "SENT" || status === "OPENED"); }
