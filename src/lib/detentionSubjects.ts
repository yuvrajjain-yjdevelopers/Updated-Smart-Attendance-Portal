export const DETENTION_SUBJECT_NAMES: Record<string, string> = {
  UNBSPR101: "Engineering Physics Practical",
  UNBST101: "Engineering Physics",
  UNBST103: "Matrices and Differential Calculus",
  UNCSPR101: "Computer Programming Practical",
  UNCST101: "Computer Programming",
  UNEEPR101: "Basic Electrical Engineering Practical",
  UNEET101: "Basic Electrical Engineering",
  UNHUPR101: "Communication Skills Practical",
  UNHUPR102: "Integrated Personality Development",
  UNHUT101: "Communication Skills",
  UNITPR102: "Programming for Problem Solving Practical",
  UNITT102: "Programming for Problem Solving",
};

export type DetainedSubject = { code: string; name: string };

export function parseDetainedSubjects(value: string | null | undefined): DetainedSubject[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Array<string | Partial<DetainedSubject>>;
    return parsed.map((subject) => {
      const raw = typeof subject === "string" ? subject : subject.code || subject.name || "";
      const code = raw.toUpperCase().replace(/[\s-]+/g, "").trim();
      const suppliedName = typeof subject === "string" ? undefined : subject.name;
      return { code, name: suppliedName && suppliedName !== raw ? suppliedName : DETENTION_SUBJECT_NAMES[code] || suppliedName || code };
    }).filter((subject) => subject.code);
  } catch {
    return [];
  }
}

export function resolveDetainedSubjectCodes(value: string | null | undefined): DetainedSubject[] {
  return (value || "").split(/[;,]/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const code = part.match(/[A-Z]{2,}[A-Z0-9\s-]{3,}/i)?.[0]?.toUpperCase().replace(/[\s-]+/g, "");
    if (!code) return null;
    return { code, name: DETENTION_SUBJECT_NAMES[code] || code };
  }).filter((subject): subject is DetainedSubject => subject !== null);
}
