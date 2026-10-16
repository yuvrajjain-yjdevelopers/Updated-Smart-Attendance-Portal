"use client";

import { useEffect, useMemo, useState } from "react";
import { parseDetainedSubjects } from "@/lib/detentionSubjects";

type Student = {
  id: string;
  regNo: string;
  name: string;
  parentMobile: string;
  studentMobile: string | null;
  branch: string | null;
  totalAttendancePct: number | null;
  avgAtt: number | null;
  isDetained: boolean;
  detainedSubjects: string;
  effectiveAttendance: number | null;
  attendanceSource: "LIST" | "ROSTER" | "NONE";
  attendanceSourceLabel: string;
  attendanceStatus: string;
  lowSubjectCount: number;
};
type Draft = {
  regNo: string;
  name: string;
  parentMobile: string;
  studentMobile: string;
  branch: string;
  totalAttendancePct: string;
};
const blank: Draft = { regNo: "", name: "", parentMobile: "", studentMobile: "", branch: "", totalAttendancePct: "" };

export default function SectionStudents({ sectionId }: { sectionId: string }) {
  const [rows, setRows] = useState<Student[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState("");
  const [query, setQuery] = useState("");
  const [missing, setMissing] = useState(false);
  const [sort, setSort] = useState<"regNo" | "name">("regNo");
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState("");
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch(`/api/sections/${sectionId}/students`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load students.");
      setRows(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load students.");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/sections/${sectionId}/students`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load students.");
        setRows(data);
      })
      .catch(error => { if (error.name !== "AbortError") setNotice("Could not load the student list. Refresh and try again."); });
    return () => controller.abort();
  }, [sectionId]);

  const visible = useMemo(() => rows
    .filter(row => (!missing || !row.parentMobile) && `${row.regNo} ${row.name}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a[sort].localeCompare(b[sort])), [rows, missing, query, sort]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageRows = visible.slice(page * pageSize, (page + 1) * pageSize);

  async function save() {
    setBusy(true);
    try {
      const url = `/api/sections/${sectionId}/students${editing ? `/${editing}` : ""}`;
      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, totalAttendancePct: draft.totalAttendancePct === "" ? null : Number(draft.totalAttendancePct) }),
      });
      const data = await response.json();
      if (!response.ok) { setNotice(data.error || "Could not save this student."); return; }
      setDraft(blank);
      setEditing("");
      setNotice(editing ? "Student updated." : "Student added.");
      await load();
    } catch {
      setNotice("Could not save this student. Check the connection and try again.");
    } finally { setBusy(false); }
  }

  async function remove(row: Student) {
    if (!confirm(`Delete ${row.name} (${row.regNo})?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sections/${sectionId}/students/${row.id}`, { method: "DELETE" });
      const data = await response.json();
      setNotice(response.ok ? "Student deleted." : data.error || "Could not delete this student.");
      if (response.ok) await load();
    } catch { setNotice("Could not delete this student. Check the connection and try again."); }
    finally { setBusy(false); }
  }

  function parsePaste() {
    const lines = paste.trim().split(/\r?\n/).map(line => line.split("\t").length === 1 ? line.split(",") : line.split("\t"));
    const first = lines[0].map(value => value.trim().toLowerCase());
    const hasHeader = first.some(value => ["reg_no", "reg no", "registration no", "name", "student name", "parent mobile"].includes(value));
    const data = hasHeader ? lines.slice(1) : lines;
    setPreview(data.filter(cells => cells.some(value => value.trim())).map(cells => ({
      regNo: cells[0]?.trim() || "", name: cells[1]?.trim() || "", parentMobile: cells[2]?.trim() || "",
      studentMobile: cells[3]?.trim() || "", branch: cells[4]?.trim() || "", totalAttendancePct: cells[5]?.trim() || "",
    })));
  }

  async function importPaste() {
    if (!preview) return;
    setBusy(true);
    try {
      const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
      const csv = [
        ["reg_no", "name", "parent_mobile", "student_mobile", "branch", "total_attendance_pct"],
        ...preview.map(item => [item.regNo, item.name, item.parentMobile, item.studentMobile, item.branch, item.totalAttendancePct]),
      ].map(row => row.map(quote).join(",")).join("\r\n");
      const response = await fetch("/api/students/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: "pasted-students.csv", csv, targetSectionId: sectionId, createSections: false }),
      });
      const data = await response.json();
      setNotice(response.ok ? data.message || "Student rows imported." : data.error || "Could not import these rows.");
      if (response.ok) { setPreview(null); setPaste(""); setPage(0); await load(); }
    } catch { setNotice("Could not import pasted rows. Check the connection and try again."); }
    finally { setBusy(false); }
  }

  async function importFile(file: File) {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      if (signature[0] === 37 && signature[1] === 80 && signature[2] === 68 && signature[3] === 70 && signature[4] === 45) {
        setNotice("This is a PDF. Use the detention-list upload above, or convert a student master PDF to Excel first."); return;
      }
      if (ext !== "csv" && ext !== "xlsx") { setNotice("Student import accepts CSV or XLSX files."); return; }
      if (ext === "xlsx" && !(signature[0] === 80 && signature[1] === 75)) { setNotice("This file does not appear to be a valid XLSX workbook."); return; }
      const body: Record<string, unknown> = { fileName: file.name, targetSectionId: sectionId, createSections: false };
      if (ext === "csv") body.csv = await file.text();
      else body.contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/students/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => null);
      if (!data) throw new Error(`Import server returned an unreadable response (HTTP ${response.status}). Check the server logs.`);
      setNotice(data.message || data.error || "Import complete.");
      if (response.ok) await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Import failed. Check the connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <section className="section-students-panel">
      <div className="section-roster-heading">
        <div><span className="eyebrow">STUDENT ROSTER</span><h2>Students <span>{rows.length}</span></h2><p>{rows.filter(student => !student.parentMobile).length} missing parent mobile · {rows.filter(student => student.attendanceStatus === "Detained" || student.attendanceStatus.startsWith("Below 75%")).length} below threshold</p></div>
        <a href="/students_template.csv" download className="section-template-link">Download student template ↓</a>
      </div>

      <form className="section-student-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label>Registration number<input required value={draft.regNo} onChange={event => setDraft({ ...draft, regNo: event.target.value })} placeholder="e.g. CS2401" /></label>
        <label>Student name<input required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Full name" /></label>
        <label>Parent mobile<input value={draft.parentMobile} onChange={event => setDraft({ ...draft, parentMobile: event.target.value })} placeholder="Optional" /></label>
        <label>Student mobile<input value={draft.studentMobile} onChange={event => setDraft({ ...draft, studentMobile: event.target.value })} placeholder="Optional" /></label>
        <label>Branch<input value={draft.branch} onChange={event => setDraft({ ...draft, branch: event.target.value })} placeholder="e.g. Computer Science" /></label>
        <label>Attendance %<input type="number" min="0" max="100" step="0.01" value={draft.totalAttendancePct} onChange={event => setDraft({ ...draft, totalAttendancePct: event.target.value })} placeholder="Optional" /></label>
        <div className="section-form-actions"><button type="submit" className="section-action-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Update student" : "Add student"}</button>{editing && <button type="button" className="section-action-secondary" onClick={() => { setEditing(""); setDraft(blank); }}>Cancel edit</button>}</div>
      </form>

      <div className="section-import-grid">
        <section className="section-import-card"><div><h3>Import a student file</h3><p>Upload a CSV or XLSX list assigned to Section {sectionId}.</p></div><label className="section-file-picker"><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); }} /><span>Choose CSV or XLSX</span><small>Files are validated before saving.</small></label></section>
        <section className="section-import-card"><div><h3>Paste rows from Excel</h3><p>Columns: registration, name, parent mobile, student mobile, branch, attendance.</p></div><textarea value={paste} onChange={event => setPaste(event.target.value)} placeholder="Paste tab-separated cells here" rows={3} /><div className="section-import-actions"><button type="button" className="section-action-secondary" onClick={parsePaste} disabled={!paste.trim()}>Preview pasted rows</button>{preview && <button type="button" className="section-action-primary" onClick={() => void importPaste()} disabled={busy}>Import {preview.length} rows</button>}</div>{preview && <p className="section-preview-note">Preview: {preview.slice(0, 5).map(row => `${row.regNo} · ${row.name}`).join(" / ")}{preview.length > 5 ? ` · +${preview.length - 5} more` : ""}</p>}</section>
      </div>

      <div className="section-roster-tools"><input aria-label="Search students" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Search by name or registration" /><label><input type="checkbox" checked={missing} onChange={event => { setMissing(event.target.checked); setPage(0); }} /> Parent mobile missing</label><select aria-label="Sort students" value={sort} onChange={event => { setSort(event.target.value as "regNo" | "name"); setPage(0); }}><option value="regNo">Sort by registration</option><option value="name">Sort by name</option></select><span>Showing {pageRows.length} of {visible.length}</span></div>
        <div className="section-student-table-wrap"><table className="section-student-table"><thead><tr><th>Registration</th><th>Student</th><th>Parent mobile</th><th>Attendance</th><th>Status and subjects</th><th>Actions</th></tr></thead><tbody>{pageRows.map(student => {const subjects=parseDetainedSubjects(student.detainedSubjects);return <tr key={student.id}><td className="section-reg-cell">{student.regNo}</td><td className="section-name-cell">{student.name}</td><td>{student.parentMobile || <span className="missing-pill">Missing</span>}</td><td>{student.effectiveAttendance===null?"—":`${student.effectiveAttendance}%`} {student.attendanceSourceLabel&&<small className="attendance-source-tag">{student.attendanceSourceLabel}</small>}</td><td><span className={student.attendanceStatus==="Detained"||student.attendanceStatus.startsWith("Below 75%")?"detained-pill":"ok-pill"}>{student.attendanceStatus}</span>{student.attendanceSource==="LIST"&&subjects.map(subject=><span className="subject-code-name" key={subject.code}>{subject.code} · {subject.name}</span>)}</td><td><div className="section-row-actions"><button type="button" onClick={() => { setEditing(student.id); setDraft({ regNo: student.regNo, name: student.name, parentMobile: student.parentMobile, studentMobile: student.studentMobile || "", branch: student.branch || "", totalAttendancePct: student.totalAttendancePct?.toString() || "" }); }}>Edit</button><button type="button" disabled={busy} onClick={() => void remove(student)}>Delete</button></div></td></tr>})}{pageRows.length === 0 && <tr><td colSpan={6} className="section-roster-empty">No students match this view.</td></tr>}</tbody></table></div>
      {visible.length > pageSize && <nav className="directory-pagination" aria-label="Roster pages"><span>Page {page + 1} of {pageCount}</span><button type="button" disabled={page === 0} onClick={() => setPage(current => current - 1)}>Previous</button><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(current => current + 1)}>Next</button></nav>}
      {notice && <p role="status" className="section-roster-notice">{notice}</p>}
    </section>
  );
}
