"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ClassMessaging from "@/app/components/class-messaging";
import { parseDetainedSubjects } from "@/lib/detentionSubjects";

type Student = {
  id: string; regNo: string; name: string; branch: string | null;
  totalAttendancePct: number | null; avgAtt: number | null; studentMobile: string | null;
  parentMobile: string; isDetained: boolean; detainedSubjects: string; lowSubjectCount: number;
  effectiveAttendance: number | null; attendanceSource: "LIST" | "ROSTER" | "NONE";
  attendanceSourceLabel: string; attendanceStatus: string;
};
type Section = { id: string; name: string; students: Student[] };

export default function StudentsBySection({ sections, senderName }: { sections: Section[]; senderName: string }) {
  const [selected, setSelected] = useState(sections[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "missing">("all");
  const [tab, setTab] = useState<"directory" | "messages">("directory");
  const section = sections.find(item => item.id === selected);
  const visible = useMemo(() => section?.students.filter(student =>
    (filter === "all" || !student.parentMobile) &&
    `${student.regNo} ${student.name} ${student.branch ?? ""}`.toLowerCase().includes(query.toLowerCase())) ?? [], [section, query, filter]);
  const eligible = section?.students.filter(student => ["Detained", "Below 75% (roster)"].includes(student.attendanceStatus)) ?? [];
  const missing = section?.students.filter(student => !student.parentMobile).length ?? 0;

  return <section className="directory-card">
    <div className="section-switcher-heading"><div><span className="eyebrow">SECTION WISE VIEW</span><h2>Student directory</h2><p>Choose a section to see only its students.</p></div><div className="section-count-chip">{sections.reduce((sum, item) => sum + item.students.length, 0)} total students</div></div>
    {sections.length === 0 ? <div className="empty-state"><h3>No sections yet</h3><p>Create sections first, then upload the student master file.</p><Link href="/sections" className="primary-link">Manage sections</Link></div> : <>
      <div className="section-tabs" role="tablist" aria-label="Student sections">{sections.map(item => <button key={item.id} role="tab" aria-selected={selected === item.id} onClick={() => { setSelected(item.id); setQuery(""); setTab("directory"); }} className={selected === item.id ? "section-tab active" : "section-tab"}>{item.name}<span>{item.students.length}</span></button>)}</div>
      {section && <>
        <div className="section-summary"><div><p className="eyebrow">SECTION {section.name}</p><h3>{section.students.length} students</h3></div><div className="section-stats"><span><b>{missing}</b> missing parent mobile</span><span><b>{eligible.length}</b> need follow-up</span><Link href={`/sections/${section.id}`}>Open section details ↗</Link></div></div>
        <div className="directory-tabs"><button className={tab === "directory" ? "active" : ""} onClick={() => setTab("directory")}>All students <span>{section.students.length}</span></button><button className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")}>Below threshold & messages <span>{eligible.length}</span></button></div>
        {tab === "directory" ? <>
          <div className="directory-tools"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, registration, or branch"/><label><input type="checkbox" checked={filter === "missing"} onChange={event => setFilter(event.target.checked ? "missing" : "all")}/> Parent mobile missing</label><span>Showing {visible.length} of {section.students.length}</span></div>
          <div className="table-scroll"><table className="directory-table"><thead><tr><th>Registration</th><th>Student</th><th>Branch</th><th>Attendance</th><th>Student mobile</th><th>Parent mobile</th><th>Status</th></tr></thead><tbody>
            {visible.map(student => { const subjects = parseDetainedSubjects(student.detainedSubjects); return <tr key={student.id}><td className="font-mono">{student.regNo}</td><td className="student-name-cell">{student.name}</td><td>{student.branch || "—"}</td><td>{student.effectiveAttendance === null ? "—" : `${student.effectiveAttendance}%`} {student.attendanceSourceLabel && <small className="attendance-source-tag">{student.attendanceSourceLabel}</small>}</td><td>{student.studentMobile || "—"}</td><td>{student.parentMobile || <span className="missing-pill">Missing</span>}</td><td><span className={student.attendanceStatus === "Detained" || student.attendanceStatus.startsWith("Below 75%") ? "detained-pill" : "ok-pill"}>{student.attendanceStatus}</span>{subjects.length > 0 && student.attendanceSource === "LIST" && <ul className="detained-subject-list">{subjects.map(subject => <li key={subject.code}><b>{subject.code}</b><span>{subject.name}</span></li>)}</ul>}</td></tr>; })}
            {!visible.length && <tr><td colSpan={7} className="empty-row">No students match this view.</td></tr>}
          </tbody></table></div>
        </> : <div className="section-messaging"><p className="muted-note">Only students classified as Detained or Below 75% (roster) are included.</p><ClassMessaging students={eligible.map(student => ({ id: student.id, name: student.name, regNo: student.regNo, parentMobile: student.parentMobile, avgAtt: student.effectiveAttendance, isDetained: student.attendanceStatus === "Detained", statusLabel: student.attendanceStatus, attendanceSourceLabel: student.attendanceSourceLabel }))} senderName={senderName} canSend isHod/></div>}
      </>}
    </>}
  </section>;
}
