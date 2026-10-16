"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ClassMessaging from "@/app/components/class-messaging";
import { parseDetainedSubjects } from "@/lib/detentionSubjects";

type Student = {
  id: string; regNo: string; name: string; branch: string | null;
  totalAttendancePct: number | null; avgAtt: number | null; studentMobile: string | null;
  parentMobile: string; isDetained: boolean; detainedSubjects: string; lowSubjectCount: number;
  effectiveAttendance: number | null; attendanceSource: "LIST" | "ROSTER" | "NONE";
  attendanceSourceLabel: string; attendanceStatus: string;
};
type Section = { id: string; name: string; studentCount: number };

export default function StudentsBySection({ sections, senderName, mobileLinkMode }: { sections: Section[]; senderName: string; mobileLinkMode: "SMS_LINK" | "GOOGLE_MESSAGES" | "PHONE" }) {
  const [selected, setSelected] = useState(sections[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const [tab, setTab] = useState<"directory" | "messages">("directory");
  const [sectionData, setSectionData] = useState<{ sectionId: string; rows: Student[] } | null>(null);
  const rows = useMemo(() => sectionData?.sectionId === selected ? sectionData.rows : [], [sectionData, selected]);
  const loading = Boolean(selected) && sectionData?.sectionId !== selected;
  const [page, setPage] = useState(0);
  const section = sections.find(item => item.id === selected);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void fetch(`/api/sections/${selected}/students`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load section students.");
        if (!controller.signal.aborted) setSectionData({ sectionId: selected, rows: data });
      })
      .catch(() => { if (!controller.signal.aborted) setSectionData({ sectionId: selected, rows: [] }); });
    return () => controller.abort();
  }, [selected]);
  const filtered = useMemo(() => rows.filter(student =>
    (filter === "all" || !student.parentMobile) &&
    `${student.regNo} ${student.name} ${student.branch ?? ""}`.toLowerCase().includes(query.toLowerCase())), [rows, query, filter]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const eligible = rows.filter(student => ["Detained"].includes(student.attendanceStatus));
  const missing = rows.filter(student => !student.parentMobile).length;

  return <section className="directory-card">
      <div className="section-switcher-heading"><div><span className="eyebrow">SECTION WISE VIEW</span><h2>Student directory</h2><p>Choose a section to see only its students.</p></div><div className="section-count-chip">{sections.reduce((sum, item) => sum + item.studentCount, 0)} total students</div></div>
    {sections.length === 0 ? <div className="empty-state"><h3>No sections yet</h3><p>Create sections first, then upload the student master file.</p><Link href="/sections" className="primary-link">Manage sections</Link></div> : <>
      <div className="section-tabs" role="tablist" aria-label="Student sections">{sections.map(item => <button key={item.id} role="tab" aria-selected={selected === item.id} onClick={() => { setSelected(item.id); setQuery(""); setPage(0); setTab("directory"); }} className={selected === item.id ? "section-tab active" : "section-tab"}>{item.name}<span>{item.studentCount}</span></button>)}</div>
      {section && <>
        <div className="section-summary"><div><p className="eyebrow">SECTION {section.name}</p><h3>{loading ? "Loading students…" : `${rows.length} students`}</h3></div><div className="section-stats"><span><b>{missing}</b> missing parent mobile</span><span><b>{eligible.length}</b> need follow-up</span><Link href={`/sections/${section.id}`}>Open section details ↗</Link></div></div>
        <div className="directory-tabs"><button className={tab === "directory" ? "active" : ""} onClick={() => setTab("directory")}>All students <span>{section.studentCount}</span></button><button className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")}>Below threshold & messages <span>{eligible.length}</span></button></div>
        {tab === "directory" ? <>
          <div className="directory-tools"><input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Search name, registration, or branch"/><label><input type="checkbox" checked={filter === "missing"} onChange={event => { setFilter(event.target.checked ? "missing" : "all"); setPage(0); }}/> Parent mobile missing</label><span>Showing {visible.length} of {filtered.length}</span></div>
          <div className="table-scroll"><table className="directory-table"><thead><tr><th>Registration</th><th>Student</th><th>Branch</th><th>Attendance</th><th>Student mobile</th><th>Parent mobile</th><th>Status</th></tr></thead><tbody>
            {visible.map(student => { const subjects = parseDetainedSubjects(student.detainedSubjects); return <tr key={student.id}><td className="font-mono">{student.regNo}</td><td className="student-name-cell">{student.name}</td><td>{student.branch || "—"}</td><td>{student.effectiveAttendance === null ? "—" : `${student.effectiveAttendance}%`} {student.attendanceSourceLabel && <small className="attendance-source-tag">{student.attendanceSourceLabel}</small>}</td><td>{student.studentMobile || "—"}</td><td>{student.parentMobile || <span className="missing-pill">Missing</span>}</td><td><span className={student.attendanceStatus === "Detained" || student.attendanceStatus.startsWith("Below 75%") ? "detained-pill" : "ok-pill"}>{student.attendanceStatus}</span>{subjects.length > 0 && student.attendanceSource === "LIST" && <ul className="detained-subject-list">{subjects.map(subject => <li key={subject.code}><b>{subject.code}</b><span>{subject.name}</span></li>)}</ul>}</td></tr>; })}
            {loading && <tr><td colSpan={7} className="empty-row">Loading this section…</td></tr>}{!loading && !visible.length && <tr><td colSpan={7} className="empty-row">No students match this view.</td></tr>}
          </tbody></table></div>
          {filtered.length > pageSize && <nav className="directory-pagination" aria-label="Student pages"><span>Page {page + 1} of {pageCount}</span><button type="button" disabled={page === 0} onClick={() => setPage(current => current - 1)}>Previous</button><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(current => current + 1)}>Next</button></nav>}
        </> : <div className="section-messaging"><p className="muted-note">Only students below the attendance threshold are included.</p><ClassMessaging sectionId={section.id} mobileLinkMode={mobileLinkMode} students={eligible.map(student => ({ id: student.id, name: student.name, regNo: student.regNo, parentMobile: student.parentMobile, avgAtt: student.effectiveAttendance, isDetained: student.attendanceStatus === "Detained", statusLabel: student.attendanceStatus, attendanceSourceLabel: student.attendanceSourceLabel }))} senderName={senderName} canSend isHod/></div>}
      </>}
    </>}
  </section>;
}
