import { NextResponse } from "next/server";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { z } from "zod";
import { extractText, getDocumentProxy } from "unpdf";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { detentionListAttendanceUpdate, isDetained } from "@/lib/attendance";
import { parseDetentionPdfPages } from "@/lib/detentionPdf";
import { resolveDetainedSubjectCodes } from "@/lib/detentionSubjects";
import { regeneratePreparedMessages } from "@/lib/preparedMessages";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
type ParsedRow = { regNo: string; name: string; branch: string; avg: number; subjects: { code: string; name: string }[] };
type ColumnKind = "registration" | "average" | "subject" | "name" | "branch";

const schema = z.object({
  csv: z.string().max(2_000_000).optional(),
  contentBase64: z.string().optional(),
  uptoDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fileName: z.string().max(150).default("detention.csv"),
  confirmOlder: z.boolean().default(false),
  action: z.enum(["preview", "apply", "add-unmatched"]).default("preview"),
});

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function columnKind(value: string): ColumnKind | null {
  const header = normalizedHeader(value);
  if (/\b(reg|registration|enrolment|enrollment|roll)\b/.test(header)) return "registration";
  if (/\b(avg|average|attendance|att)\b/.test(header) && /\b(att|attendance|percent|percentage|pct|avg|average)\b/.test(header)) return "average";
  if (/\b(detained|subject|course|paper)\b/.test(header)) return "subject";
  if (/\b(student name|name of student|name)\b/.test(header)) return "name";
  if (/\b(branch|programme|program|department)\b/.test(header)) return "branch";
  return null;
}

function parseAverage(value: string) {
  const raw = value.trim().replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw.replace(/%/g, ""));
  if (!Number.isFinite(parsed)) return null;
  const percent = parsed <= 1 && !raw.includes("%") ? parsed * 100 : parsed;
  return percent >= 0 && percent <= 100 ? percent : null;
}

function cleanRegNo(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function parseCsvRows(csv: string) {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizedHeader,
  });
  if (result.data.length > 5000) return { rows: [], errors: [], error: "List may contain at most 5,000 rows." };
  const fields = result.meta.fields ?? [];
  const columns: Partial<Record<ColumnKind, string>> = {};
  for (const field of fields) {
    const kind = columnKind(field);
    if (kind && !columns[kind]) columns[kind] = field;
  }
  if (!columns.registration || !columns.average) {
    return { rows: [], errors: [], error: "Could not identify registration-number and average-attendance columns. Add clear column headers and preview again." };
  }

  const errors: string[] = [];
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  result.data.forEach((record, index) => {
    const regNo = cleanRegNo(record[columns.registration!] || "");
    const avg = parseAverage(record[columns.average!] || "");
    if (!regNo || avg === null) {
      errors.push(`Row ${index + 2}: expected a registration number and attendance from 0 to 100.`);
      return;
    }
    if (seen.has(regNo)) {
      errors.push(`Row ${index + 2}: duplicate registration number ${regNo}.`);
      return;
    }
    const subjectText = columns.subject ? record[columns.subject] || "" : "";
    rows.push({
      regNo,
      name: columns.name ? record[columns.name] || "" : "",
      branch: columns.branch ? record[columns.branch] || "" : "",
      avg,
      subjects: resolveDetainedSubjectCodes(subjectText),
    });
    seen.add(regNo);
  });
  return { rows, errors, error: "" };
}

async function parseWorkbook(bytes: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], error: "The workbook has no worksheets." };

  let headerRowNumber = 0;
  const columns: Partial<Record<ColumnKind, number>> = {};
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 40); rowNumber++) {
    const candidates: Partial<Record<ColumnKind, number>> = {};
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const kind = columnKind(cell.text);
      if (kind && !candidates[kind]) candidates[kind] = columnNumber;
    });
    if (candidates.registration && candidates.average) {
      headerRowNumber = rowNumber;
      Object.assign(columns, candidates);
      break;
    }
  }
  if (!headerRowNumber || !columns.registration || !columns.average) {
    return { rows: [], error: "Could not identify registration-number and average-attendance columns in the first worksheet. Check the header labels and preview again." };
  }

  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  const cellText = (rowNumber: number, kind: ColumnKind) => {
    const column = columns[kind];
    return column ? sheet.getRow(rowNumber).getCell(column).text.trim() : "";
  };
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const regNo = cleanRegNo(cellText(rowNumber, "registration"));
    if (!regNo) continue;
    const avg = parseAverage(cellText(rowNumber, "average"));
    if (avg === null) return { rows: [], error: `Could not read a valid AVG attendance for ${regNo} on spreadsheet row ${rowNumber}.` };
    if (seen.has(regNo)) continue;
    rows.push({
      regNo,
      name: cellText(rowNumber, "name"),
      branch: cellText(rowNumber, "branch"),
      avg,
      subjects: resolveDetainedSubjectCodes(cellText(rowNumber, "subject")),
    });
    seen.add(regNo);
    if (rows.length > 5000) return { rows: [], error: "List may contain at most 5,000 rows." };
  }
  return { rows, error: "" };
}

export async function POST(request: Request, { params }: Context) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: sectionId } = await params;
  if (user.role !== "HOD" && !(user.role === "TEACHER" && user.sectionId === sectionId)) {
    return NextResponse.json({ error: "You can upload a detention list only for your assigned section." }, { status: 403 });
  }
  if (user.role === "TEACHER" && !user.sectionId) return NextResponse.json({ error: "Your account is not assigned to a section." }, { status: 403 });
  const section = await db.section.findUnique({ where: { id: sectionId } });
  if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid PDF, CSV, or XLSX file and list date." }, { status: 400 });
  if (user.role === "TEACHER" && parsed.data.action === "add-unmatched") {
    return NextResponse.json({ error: "Only the HOD can add unmatched students to the roster." }, { status: 403 });
  }

  const input = parsed.data;
  const extension = input.fileName.split(".").pop()?.toLowerCase();
  let rows: ParsedRow[] = [];
  let sourceType = "CSV";

  if (extension === "pdf") {
    if (!input.contentBase64) return NextResponse.json({ error: "Could not read this PDF file." }, { status: 400 });
    const bytes = Buffer.from(input.contentBase64, "base64");
    if (bytes.length > 10_000_000) return NextResponse.json({ error: "PDF must be 10 MB or smaller." }, { status: 413 });
    if (bytes.subarray(0, 5).toString() !== "%PDF-") return NextResponse.json({ error: "The .pdf extension does not match the file content." }, { status: 415 });
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text, totalPages } = await extractText(pdf);
      const pages = Array.isArray(text) ? text : [text];
      rows = parseDetentionPdfPages(pages).map(row => ({
        regNo: cleanRegNo(row.regNo), name: row.name, branch: row.branch, avg: row.avg,
        subjects: resolveDetainedSubjectCodes(row.subjects.join(";")),
      }));
      if (!rows.length) return NextResponse.json({ error: `No student rows found in this ${totalPages}-page PDF. It must contain selectable text; scanned/image-only PDFs need OCR before upload.` }, { status: 422 });
    } catch {
      return NextResponse.json({ error: "Could not read the detention PDF. Confirm it is a text-based PDF." }, { status: 422 });
    }
    sourceType = "PDF";
  } else if (extension === "xlsx") {
    if (!input.contentBase64) return NextResponse.json({ error: "Could not read this XLSX file." }, { status: 400 });
    const bytes = Buffer.from(input.contentBase64, "base64");
    if (bytes.length > 10_000_000) return NextResponse.json({ error: "Excel file must be 10 MB or smaller." }, { status: 413 });
    if (bytes.subarray(0, 2).toString() !== "PK") return NextResponse.json({ error: "The .xlsx extension does not match the file content." }, { status: 415 });
    try {
      const parsedWorkbook = await parseWorkbook(bytes);
      if (parsedWorkbook.error) return NextResponse.json({ error: parsedWorkbook.error }, { status: 422 });
      rows = parsedWorkbook.rows;
      if (!rows.length) return NextResponse.json({ error: "No student records were found below the detected headers." }, { status: 422 });
    } catch {
      return NextResponse.json({ error: "Could not read this workbook. Save it as a valid .xlsx file and retry." }, { status: 422 });
    }
    sourceType = "XLSX";
  } else if (extension === "csv") {
    if (input.csv === undefined) return NextResponse.json({ error: "Could not read this CSV file." }, { status: 400 });
    const parsedCsv = parseCsvRows(input.csv);
    if (parsedCsv.error) return NextResponse.json({ error: parsedCsv.error }, { status: 422 });
    if (parsedCsv.errors.length) return NextResponse.json({ error: "Some detention-list rows are invalid.", errors: parsedCsv.errors.slice(0, 10), errorCount: parsedCsv.errors.length }, { status: 400 });
    rows = parsedCsv.rows;
  } else {
    return NextResponse.json({ error: "Supported detention-list formats are CSV, XLSX, and text-based PDF." }, { status: 415 });
  }

  if (rows.length > 5000) return NextResponse.json({ error: "List may contain at most 5,000 rows." }, { status: 400 });
  const date = new Date(`${input.uptoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid list date." }, { status: 400 });
  const latest = await db.detentionUpload.findFirst({ where: { sectionId }, orderBy: { uptoDate: "desc" } });
  if (input.action === "apply" && latest && date < latest.uptoDate && !input.confirmOlder) {
    return NextResponse.json({ error: `This date is older than the latest list (${latest.uptoDate.toISOString().slice(0, 10)}). Confirm to apply the older list.`, needsOlderConfirmation: true }, { status: 409 });
  }

  const students = await db.student.findMany({ where: { sectionId } });
  const byReg = new Map(rows.map(row => [row.regNo, row]));
  const matched = students.filter(student => byReg.has(student.regNo));
  const matchedRegs = new Set(matched.map(student => student.regNo));
  const unmatched = rows.filter(row => !matchedRegs.has(row.regNo));
  const setting = await db.setting.findMany({ where: { key: { in: ["attendanceThreshold", "threshold"] } }, select: { key: true, value: true } });
  const settingValues = Object.fromEntries(setting.map(row => [row.key, row.value]));
  const threshold = Number(settingValues.attendanceThreshold || settingValues.threshold || 75);
  const detainedCount = rows.filter(row => isDetained(row.avg, threshold)).length;

  if (input.action === "preview") {
    return NextResponse.json({
      preview: true, blocksFound: new Set(rows.map(row => row.branch).filter(Boolean)).size || 1,
      parsedCount: rows.length, matchedCount: matched.length, unmatchedCount: unmatched.length,
      unmatched: unmatched.map(({ regNo, name, branch, avg }) => ({ regNo, name, branch, avg })),
      detainedCount, atOrAboveThreshold: rows.length - detainedCount,
      exactly75: rows.filter(row => row.avg === threshold).length,
      notListed: Math.max(0, students.length - matched.length), uptoDate: input.uptoDate,
    });
  }

  if (input.action === "add-unmatched") {
    let added = 0;
    for (const row of unmatched) {
      const exists = await db.student.findUnique({ where: { regNo: row.regNo }, select: { id: true } });
      if (exists) continue;
      await db.student.create({ data: {
        regNo: row.regNo, name: row.name || row.regNo, sectionId, parentMobile: "", studentMobile: null,
        branch: row.branch || null, ...detentionListAttendanceUpdate(row.avg, row.subjects.length, date, threshold),
        detainedSubjects: JSON.stringify(row.subjects), lowSubjectCount: row.subjects.length, lastListDate: date,
      } });
      added++;
    }
    await regeneratePreparedMessages(sectionId);
    return NextResponse.json({ added, message: `Added ${added} new students. Existing students in other sections were left in place.` });
  }

  const existing = await db.detentionUpload.findUnique({ where: { sectionId_uptoDate: { sectionId, uptoDate: date } } });
  const currentStudents = await db.student.findMany({ where: { sectionId } });
  const countMatched = currentStudents.filter(student => byReg.has(student.regNo));
  const detainedMatched = countMatched.filter(student => isDetained(byReg.get(student.regNo)!.avg, threshold)).length;
  await db.$transaction(async tx => {
    let uploadId: string;
    if (existing) {
      await tx.detentionEntry.deleteMany({ where: { uploadId: existing.id } });
      await tx.detentionUpload.update({ where: { id: existing.id }, data: { uploadedById: user.id, sourceType, fileName: input.fileName, parsedCount: rows.length, matchedCount: countMatched.length, detainedCount: detainedMatched } });
      uploadId = existing.id;
    } else {
      const upload = await tx.detentionUpload.create({ data: { sectionId, uploadedById: user.id, uptoDate: date, sourceType, fileName: input.fileName, parsedCount: rows.length, matchedCount: countMatched.length, detainedCount: detainedMatched } });
      uploadId = upload.id;
    }
    for (const student of currentStudents) {
      const row = byReg.get(student.regNo);
      if (!row) {
        await tx.student.update({ where: { id: student.id }, data: { avgAtt: null, isDetained: false, detainedSubjects: "[]", lowSubjectCount: 0, lastListDate: date } });
        continue;
      }
      await tx.student.update({ where: { id: student.id }, data: { ...detentionListAttendanceUpdate(row.avg, row.subjects.length, date, threshold), isDetained: isDetained(row.avg, threshold), detainedSubjects: JSON.stringify(row.subjects) } });
      await tx.detentionEntry.create({ data: { uploadId, studentId: student.id, avgAtt: row.avg, detainedSubjects: JSON.stringify(row.subjects) } });
    }
  }, { maxWait: 10_000, timeout: 30_000 });
  await regeneratePreparedMessages(sectionId);
  return NextResponse.json({ parsedCount: rows.length, matchedCount: countMatched.length, notInSection: unmatched.length, detainedCount: detainedMatched, notListed: currentStudents.length - countMatched.length, uptoDate: input.uptoDate });
}
