"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Search, Download, History, AlertCircle } from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import ClassMessaging from "@/app/components/class-messaging";
import { todayInIndia } from "./date";

type Student = { id: string; regNo: string; name: string; parentMobile: string; status: "PRESENT" | "ABSENT"; absentDaysThisMonth?: number };
type Section = { id: string; name: string; markedBy: string | null; submittedAt: string | null; isHoliday: boolean; present: number; absent: number; total: number };
type Data = { section?: { id: string; name: string }; students?: Student[]; record?: { isHoliday: boolean; submittedAt: string; markedBy: string } | null; history?: Array<{ id: string; studentId: string | null; field: string; fromValue: string | null; toValue: string | null; changedAt: string; changedBy: string }>; sections?: Section[]; monthly?: Array<{ date: string; sectionId: string; entries: Array<{ studentId: string; status: string }> }> };

export default function DailyAttendanceClient({ role, teacherSectionId, canMark, canSend, senderName, senderMobile, mobileLinkMode }: { role: string; teacherSectionId: string | null; canMark: boolean; canSend: boolean; senderName: string; senderMobile: string; mobileLinkMode: "SMS_LINK" | "GOOGLE_MESSAGES" | "PHONE" }) {
  const [date, setDate] = useState(todayInIndia());
  const [sectionId, setSectionId] = useState(teacherSectionId || "");
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [history, setHistory] = useState<Data["history"]>([]);
  const [record, setRecord] = useState<Data["record"]>(null);
  const [draft, setDraft] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [holiday, setHoliday] = useState(false);
  const [tab, setTab] = useState("mark");
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<"regNo" | "name">("regNo");
  const [monthRows, setMonthRows] = useState<Data["monthly"]>([]);
  const [exportFrom, setExportFrom] = useState(() => `${todayInIndia().slice(0, 7)}-01`);
  const [exportTo, setExportTo] = useState(() => todayInIndia());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messageStatuses, setMessageStatuses] = useState<Array<{ studentId: string; channel: string; status: string; createdAt?: string }>>([]);
  const [availableAfter, setAvailableAfter] = useState("");
  const today = todayInIndia();

  async function load() {
    if (!sectionId) {
      const response = await fetch(`/api/daily-attendance?date=${date}`, { cache: "no-store" });
      const data: Data = await response.json();
      if (!response.ok) throw new Error((data as { error?: string }).error || "Could not load attendance.");
      setSections(data.sections || []);
      setMonthRows(data.monthly || []);
      return;
    }
    const month = date.slice(0, 7);
    const [attendanceResponse, summaryResponse] = await Promise.all([
      fetch(`/api/daily-attendance?sectionId=${encodeURIComponent(sectionId)}&date=${date}`, { cache: "no-store" }),
      fetch(`/api/daily-attendance?date=${date}&month=${month}`, { cache: "no-store" }),
    ]);
    const [data, summary] = await Promise.all([attendanceResponse.json(), summaryResponse.json()]);
    if (!attendanceResponse.ok) throw new Error(data.error || "Could not load attendance.");
    setStudents(data.students || []);
    setSectionName(data.section?.name || "");
    setRecord(data.record || null);
    setDraft(false);
    setHoliday(Boolean(data.record?.isHoliday));
    setHistory(data.history || []);
    setAvailableAfter(data.availableAfter || "");
    const messageResponse = await fetch(`/api/daily-attendance/prepare-messages?sectionId=${encodeURIComponent(sectionId)}&date=${date}`, { cache: "no-store" });
    if (messageResponse.ok) { const messages = await messageResponse.json(); setMessageStatuses(messages.statuses || []); }
    setSections(summary.sections || []);
    setMonthRows(summary.monthly || []);
  }
  useEffect(() => { const params = new URLSearchParams(window.location.search); const resumeSession = params.get("resumeSession"); const requestedSection = params.get("sectionId"); if (requestedSection) queueMicrotask(() => setSectionId(requestedSection)); if (resumeSession) { queueMicrotask(() => setTab("absent")); void fetch(`/api/send-sessions/${resumeSession}`, { cache: "no-store" }).then(response => response.json()).then(data => { if (data.session?.date) setDate(data.session.date); if (data.session?.sectionId) setSectionId(data.session.sectionId); }).catch(() => {}); } }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { let active = true; queueMicrotask(() => { void load().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load attendance."); }); }); return () => { active = false; }; }, [date, sectionId]);

  const visible = useMemo(() => students.filter(s => `${s.regNo} ${s.name}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a[order].localeCompare(b[order], undefined, { numeric: true })), [students, search, order]);
  const absent = useMemo(() => students.filter(student => student.status === "ABSENT"), [students]);
  const absentMessagingStudents = useMemo(() => absent.map(student => { const status = (channel: string) => { const latest = messageStatuses.filter(row => row.studentId === student.id && row.channel === channel).sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0]?.status; return latest === "SENT_BY_USER" ? "Sent by user" : latest === "OPENED" ? "Opened" : latest === "SENT" ? "Sent" : "Not sent"; }; return { id: student.id, name: student.name, regNo: student.regNo, parentMobile: student.parentMobile, avgAtt: null, isDetained: false, statusLabel: "Absent", attendanceSourceLabel: "", absentDaysThisMonth: student.absentDaysThisMonth || 0, smsStatus: status("SMS"), whatsappStatus: status("WHATSAPP") }; }), [absent, messageStatuses]);
  const presentCount = holiday ? 0 : students.length - absent.length;
  function setStatus(id: string, status: Student["status"]) { setDraft(true); setStudents(rows => rows.map(row => row.id === id ? { ...row, status } : row)); }
  function markAll(status: Student["status"]) { setDraft(true); setStudents(rows => rows.map(row => ({ ...row, status }))); }

  async function submit() {
    if (busy || !sectionId) return;
    const absentCount = holiday ? 0 : absent.length;
    const present = holiday ? 0 : presentCount;
    if (!window.confirm(holiday ? "Submit this day as a holiday?" : `${absentCount} absent, ${present} present. Submit attendance?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/daily-attendance", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId, date, isHoliday: holiday, entries: students.map(({ id, status }) => ({ studentId: id, status })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not submit attendance.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit attendance."); }
    finally { setBusy(false); }
  }
  async function exportCsv() {
    if (!sectionId) return;
    const response = await fetch(`/api/daily-attendance?sectionId=${encodeURIComponent(sectionId)}&date=${date}&from=${exportFrom}&to=${exportTo}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not export the selected date range."); return; }
    const monthDays = data.monthly || [];
    const rows = [["Date", "Section", "Reg No", "Name", "Status"]];
    for (const entry of monthDays) {
      if (entry.sectionId !== sectionId) continue;
      for (const status of entry.entries) {
        const student = students.find(s => s.id === status.studentId);
        rows.push([entry.date.slice(0, 10), sectionId, student?.regNo || status.studentId, student?.name || "", status.status]);
      }
    }
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `attendance-${sectionId}-${exportFrom}-to-${exportTo}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }
  const monthDays = useMemo(() => [...new Set((monthRows || []).filter(row => row.sectionId === sectionId).map(row => row.date.slice(0, 10)))].sort(), [monthRows, sectionId]);
  const statusByDay = useMemo(() => new Map((monthRows || []).filter(row => row.sectionId === sectionId).flatMap(row => row.entries.map(entry => [`${entry.studentId}:${row.date.slice(0, 10)}`, entry.status] as const))), [monthRows, sectionId]);
  const timeNowInIndia = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const messagesAvailable = !availableAfter || role === "HOD" || timeNowInIndia >= availableAfter;

  return <main className="daily-page">
    <PageHeader eyebrow="DAILY RECORDS" title="Daily Attendance" subtitle="Record present and absent students for each class day." actions={<span className="daily-title-icon"><CalendarCheck size={21} /></span>} />
    {error && <div role="alert" className="daily-error"><AlertCircle size={17} />{error}</div>}
    <section className="daily-controls">
      <label>Date<input type="date" value={date} max={today} onChange={event => setDate(event.target.value)} /></label>
      {role === "HOD" ? <label>Section<select value={sectionId} onChange={event => setSectionId(event.target.value)}><option value="">All sections</option>{sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label> : <label>Section<input value={sectionName || "Loading…"} readOnly /></label>}
      {sectionId && <div className="daily-record-status"><small>Status</small><b>{draft ? "Draft" : record ? `Submitted by ${record.markedBy} · ${new Date(record.submittedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}` : "Not marked"}</b></div>}
      {sectionId && <label className="daily-holiday"><input type="checkbox" checked={holiday} disabled={role === "TEACHER" && !canMark} onChange={event => { setDraft(true); setHoliday(event.target.checked); }} /> No class today (holiday)</label>}
    </section>
    {role === "HOD" && !sectionId ? <section className="daily-summary-card"><h2>Section status · {date}</h2><div className="daily-table-scroll"><table><thead><tr><th>Section</th><th>Status</th><th>Marked by</th><th>Present</th><th>Absent</th><th>Roster</th></tr></thead><tbody>{sections.map(section => <tr key={section.id}><td>{section.name}</td><td>{section.submittedAt ? section.isHoliday ? "Holiday" : "Submitted" : "Not marked"}</td><td>{section.markedBy || "—"}</td><td>{section.present}</td><td>{section.absent}</td><td><button onClick={() => setSectionId(section.id)}>Open</button></td></tr>)}{!sections.length && <tr><td colSpan={6}>No sections available.</td></tr>}</tbody></table></div></section> : <>
      <nav className="daily-tabs" aria-label="Attendance views"><button className={tab === "mark" ? "active" : ""} onClick={() => setTab("mark")}>Mark attendance <span>{students.length}</span></button><button className={tab === "absent" ? "active" : ""} onClick={() => setTab("absent")}>Absent today &amp; messages <span>{absent.length}</span></button><button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>Summary</button></nav>
      {tab === "mark" && <section className="daily-roster-card">
        <div className="daily-roster-tools"><div><h2>{students.length ? "Class roster" : "No students in this section"}</h2><p>{holiday ? "Holiday selected" : `Present ${presentCount} · Absent ${absent.length}`}{role === "TEACHER" && !canMark ? " · Marking disabled for your account" : ""}</p></div><div className="daily-actions"><button disabled={role === "TEACHER" && !canMark} onClick={() => markAll("PRESENT")}>Mark all present</button><button disabled={role === "TEACHER" && !canMark} onClick={() => markAll("ABSENT")}>Mark all absent</button></div></div>
        <div className="daily-roster-filter"><label><Search size={16} /><input placeholder="Search name or registration number" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Roster order" value={order} onChange={event => setOrder(event.target.value as "regNo" | "name")}><option value="regNo">Registration number</option><option value="name">Name</option></select></div>
        <div className="daily-student-list">{visible.map((student, index) => <article key={student.id} className="daily-student"><span className="daily-student-index">{index + 1}</span><div><b>{student.name}</b><small>{student.regNo}</small>{student.status === "PRESENT" && messageStatuses.some(row => row.studentId === student.id && ["SENT", "SENT_BY_USER", "OPENED"].includes(row.status)) && <small className="daily-sent-warning">Message already sent for this date</small>}</div><div className="daily-toggle" role="group" aria-label={`Attendance for ${student.name}`}><button disabled={role === "TEACHER" && !canMark} aria-pressed={student.status === "PRESENT"} className={student.status === "PRESENT" ? "selected present" : ""} onClick={() => setStatus(student.id, "PRESENT")}>Present</button><button disabled={role === "TEACHER" && !canMark} aria-pressed={student.status === "ABSENT"} className={student.status === "ABSENT" ? "selected absent" : ""} onClick={() => setStatus(student.id, "ABSENT")}>Absent</button></div></article>)}{students.length > 0 && !visible.length && <p className="daily-empty">No students match this search.</p>}</div>
        <div className="daily-submit-row"><span>Changes are saved when you submit.</span><button disabled={busy || !students.length || role === "TEACHER" && !canMark} onClick={() => void submit()}>{busy ? "Saving…" : "Submit attendance"}</button></div>
      </section>}
      {tab === "absent" && <section className="daily-summary-card"><div className="daily-roster-tools"><div><h2>Absent students · {absent.length}</h2><p>Parent numbers and delivery status for {date}</p></div></div><ClassMessaging key={`${sectionId}:${date}`} kind="ABSENCE" date={date} sendAfter={!messagesAvailable ? availableAfter : ""} sectionId={sectionId} mobileLinkMode={mobileLinkMode} students={absentMessagingStudents} senderName={senderName} senderMobile={senderMobile} canSend={canSend && messagesAvailable} isHod={role === "HOD"} /></section>}
      {tab === "summary" && <section className="daily-summary-card"><div className="daily-roster-tools"><div><h2>Monthly attendance · {date.slice(0, 7)}</h2><p>Student by day grid · absent total at the end of each row</p></div></div><div className="daily-export-tools"><label>From<input type="date" value={exportFrom} max={today} onChange={event => setExportFrom(event.target.value)} /></label><label>To<input type="date" value={exportTo} max={today} onChange={event => setExportTo(event.target.value)} /></label><button onClick={() => void exportCsv()}><Download size={16} />Export CSV</button></div><div className="daily-table-scroll"><table><thead><tr><th>Reg No</th><th>Student</th>{monthDays.map(day => <th key={day}>{Number(day.slice(-2))}</th>)}<th>Absent</th></tr></thead><tbody>{students.map(student => { const absentTotal = monthDays.filter(day => statusByDay.get(`${student.id}:${day}`) === "ABSENT").length; return <tr key={student.id}><td>{student.regNo}</td><td>{student.name}</td>{monthDays.map(day => { const status = statusByDay.get(`${student.id}:${day}`); return <td key={day} aria-label={`${day}: ${status || "not marked"}`}>{status === "PRESENT" ? "P" : status === "ABSENT" ? "A" : "—"}</td>; })}<td>{absentTotal}</td></tr>; })}{!students.length && <tr><td colSpan={monthDays.length + 3}>No students in this section.</td></tr>}</tbody></table></div></section>}
      <details className="daily-history"><summary><History size={16} /> History for this day ({history?.length || 0})</summary>{history?.length ? <ul>{history.map(item => <li key={item.id}><b>{item.changedBy}</b> · {item.field}{item.studentId ? ` (${students.find(student => student.id === item.studentId)?.name || "student"})` : ""}: {item.fromValue || "—"} → {item.toValue || "—"} · {new Date(item.changedAt).toLocaleString("en-IN")}</li>)}</ul> : <p>No changes recorded yet.</p>}</details>
    </>}
  </main>;
}
