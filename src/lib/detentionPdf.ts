export type ParsedDetentionStudent = {
  regNo: string;
  name: string;
  avg: number;
  subjects: string[];
  branch: string;
};

const STUDENT_ROW = /^\s*\d+\s+(?:-\s+)?(?:(?:\d+)\s+){0,3}([A-Z0-9]{9,24})\s*(.*)$/i;
const OVERALL_AVERAGE_WITH_CGPA = /(\d{1,3}(?:\.\d+)?)\s*%\s*(?=N\s*\/\s*A\b)/i;
const DECIMAL_AVERAGE = /(\d{1,3}\.\d+)\s*%/;
const SUBJECT_CODE = /\b[A-Z]{2,}[A-Z0-9]{3,}\b/gi;

function tidy(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseAverageLine(lines: string[]) {
  for (const line of lines) {
    const match = line.match(OVERALL_AVERAGE_WITH_CGPA) ?? line.match(DECIMAL_AVERAGE);
    if (match) return { line, value: Number(match[1]), index: match.index ?? 0, length: match[0].length };
  }
  return null;
}

function extractSubjects(lines: string[]) {
  const subjects = new Set<string>();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    for (const match of line.matchAll(SUBJECT_CODE)) {
      let code = match[0].toUpperCase();
      if (!/\d{3,}$/.test(code)) {
        const continuation = lines[index + 1]?.match(/^([0-9]{1,3})\s*-?$/)?.[1];
        if (continuation) {
          code += continuation;
          index++;
        }
      }
      // The report's course codes contain a three-digit course number. This
      // avoids treating labels such as "N/A" or page metadata as courses.
      if (/\d{3,}$/.test(code)) subjects.add(code);
    }
  }
  return [...subjects];
}

export function parseDetentionPdfPages(pages: string[]): ParsedDetentionStudent[] {
  const result: ParsedDetentionStudent[] = [];
  let branch = "";
  let branchNeedsContinuation = false;
  let block: string[] = [];

  const flush = () => {
    if (!block.length) return;
    const average = parseAverageLine(block);
    const firstLine = block[0];
    const rowStart = firstLine?.match(STUDENT_ROW);
    if (!average || !rowStart) {
      block = [];
      return;
    }

    const averageLineIndex = block.indexOf(average.line);
    const nameText = [rowStart[2], ...block.slice(1, averageLineIndex), average.line.slice(0, average.index)]
      .join(" ")
      .replace(/\d{1,3}(?:\.\d+)?\s*%/g, " ")
      .replace(/\bN\s*\/\s*A\b/gi, " ");
    const name = tidy(nameText.replace(/[|]+/g, " ").replace(/\s+-\s*$/g, ""));

    const avgLineRemainder = average.line.slice(average.index + average.length);
    const subjectLines = [avgLineRemainder, ...block.slice(block.indexOf(average.line) + 1)];
    const subjects = extractSubjects(subjectLines);
    if (name && Number.isFinite(average.value) && average.value >= 0 && average.value <= 100) {
      result.push({ regNo: rowStart[1].toUpperCase(), name, avg: average.value, subjects, branch });
    }
    block = [];
  };

  for (const page of pages) {
    for (const rawLine of page.split(/\r?\n/)) {
      const line = tidy(rawLine);
      if (!line) continue;

      if (/^(?:abbrevation|abbreviation|legend)\b/i.test(line)) {
        flush();
        break;
      }

      const branchMatch = line.match(/\bbranch\s*:\s*(.+?)(?:\s+semester\b|\s+section\b|$)/i);
      if (branchMatch && !STUDENT_ROW.test(line)) {
        branch = tidy(branchMatch[1].replace(/\s+attendance\b.*$/i, ""));
        branchNeedsContinuation = !/\b(?:semester|section)\b/i.test(line);
        continue;
      }

      if (branchNeedsContinuation && !STUDENT_ROW.test(line) && !/^(?:academic session|degree|section)\b/i.test(line)) {
        const continuation = /^(?:roll|no\b|registration|student|avg\b|s\.?\s*no\b)/i.test(line)
          ? undefined
          : line.match(/^([A-Z][A-Z &-]{1,60}?)(?:\s+semester\b|\s+section\b|$)/i)?.[1];
        if (continuation) branch = tidy(`${branch} ${continuation}`);
        branchNeedsContinuation = false;
        continue;
      }

      if (STUDENT_ROW.test(line)) {
        flush();
        block.push(line);
      } else if (block.length) {
        block.push(line);
      }
    }
    flush();
  }
  return result;
}
