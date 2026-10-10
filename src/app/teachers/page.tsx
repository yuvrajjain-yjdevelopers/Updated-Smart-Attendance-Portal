"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Check,
  Copy,
  Download,
  KeyRound,
  Phone,
  Printer,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { PageHeader } from "@/app/components/ui";

type Teacher = {
  id: string;
  name: string;
  username: string;
  sectionId: string | null;
  section: { id: string; name: string } | null;
  canSend: boolean;
  active: boolean;
  gatewayConfigured: boolean;
  senderNumber: string | null;
  lastTestAt: string | null;
  lastSuccessfulTestAt: string | null;
  lastTestOk: boolean | null;
  lastLoginAt: string | null;
};

type Section = { id: string; name: string };
type Credentials = { name: string; username: string; password: string; section: string };

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [name, setName] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [mobile, setMobile] = useState("");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [teacherResponse, sectionResponse] = await Promise.all([
      fetch("/api/teachers"),
      fetch("/api/sections"),
    ]);
    const [teacherData, sectionData] = await Promise.all([
      teacherResponse.json(),
      sectionResponse.json(),
    ]);
    if (!teacherResponse.ok) throw new Error(teacherData.error);
    setTeachers(teacherData);
    const sectionRows = sectionData.map((section: Section) => ({ id: section.id, name: section.name }));
    setSections(sectionRows);
    setSectionId((current) => current || sectionRows[0]?.id || "");
  }

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/teachers", { signal: controller.signal }),
      fetch("/api/sections", { signal: controller.signal }),
    ])
      .then(async ([teacherResponse, sectionResponse]) => {
        const [teacherData, sectionData] = await Promise.all([
          teacherResponse.json(),
          sectionResponse.json(),
        ]);
        if (!teacherResponse.ok) throw new Error(teacherData.error);
        setTeachers(teacherData);
        const sectionRows = sectionData.map((section: Section) => ({ id: section.id, name: section.name }));
        setSections(sectionRows);
        setSectionId((current) => current || sectionRows[0]?.id || "");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Could not load teachers.");
        }
      });
    return () => controller.abort();
  }, []);

  async function add() {
    if (!name.trim() || !sectionId || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sectionId, mobile }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCredentials(data);
      setName("");
      setMobile("");
      setError("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the teacher login.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(teacher: Teacher, change: Record<string, unknown>) {
    const response = await fetch("/api/teachers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: teacher.id, ...change }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error);
      return;
    }
    if (data.password) {
      setCredentials({
        name: teacher.name,
        username: data.username,
        password: data.password,
        section: teacher.section?.name || "Unassigned",
      });
      return;
    }
    await load();
  }

  async function remove(teacher: Teacher) {
    if (!window.confirm(`Remove ${teacher.name} from the teacher list? Their access will be disabled.`)) return;
    const response = await fetch(`/api/teachers?id=${teacher.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) setError(data.error);
    else await load();
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  function download() {
    if (!credentials) return;
    const csv = `name,username,password,section\n"${credentials.name}","${credentials.username}","${credentials.password}","${credentials.section}"`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "teacher-credentials.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function printSlip() {
    if (!credentials) return;
    const printWindow = window.open("", "_blank", "width=600,height=400");
    if (!printWindow) return;
    printWindow.document.write(
      `<h1>Smart Attendance Portal</h1><p>Name: ${credentials.name}</p><p>Section: ${credentials.section}</p><p>Username: ${credentials.username}</p><p>Password: ${credentials.password}</p>`,
    );
    printWindow.document.close();
    printWindow.print();
  }

  const assignedCount = teachers.filter((teacher) => teacher.sectionId).length;
  const readyPhones = teachers.filter((teacher) => teacher.gatewayConfigured).length;

  return (
    <main className="teachers-page">
      <PageHeader className="teachers-heading" eyebrow="PEOPLE" title="Teachers" subtitle="Manage teacher logins, section access, and sender phone readiness." actions={<div className="teachers-heading-icon" aria-hidden="true"><UsersRound size={22} /></div>} />

      <section className="teacher-create-card" aria-labelledby="teacher-create-title">
        <div className="teacher-create-intro">
          <span className="teacher-create-icon"><UserPlus size={19} /></span>
          <div>
            <h2 id="teacher-create-title">Add a teacher</h2>
            <p>Create a sign-in and assign the teacher to a section.</p>
          </div>
        </div>
        <div className="teacher-create-form">
          <label className="teacher-field"><span>Teacher name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Priya Sharma" /></label>
          <label className="teacher-field"><span>Section</span><select value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">Choose a section</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
          <label className="teacher-field"><span>Mobile <small>optional</small></span><input inputMode="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="Teacher’s phone number" /></label>
          <button className="teacher-add-button" disabled={!name.trim() || !sectionId || busy} onClick={() => void add()}><UserPlus size={16} />{busy ? "Creating…" : "Create login"}</button>
        </div>
        <p className="teacher-privacy-note"><ShieldCheck size={14} />Gateway credentials stay private. Only setup status and sender number are shown here.</p>
      </section>

      {error && <div role="alert" className="teachers-error"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss message"><X size={16} /></button></div>}

      <div className="teachers-list-heading">
        <div><p className="eyebrow">TEAM ACCESS</p><h2>Teacher accounts <span>{teachers.length}</span></h2></div>
        <div className="teachers-overview-stats"><span><UsersRound size={15} />{assignedCount} assigned</span><span><Phone size={15} />{readyPhones} phones configured</span></div>
      </div>

      {teachers.length ? (
        <div className="teacher-list">
          {teachers.map((teacher, index) => (
            <article key={teacher.id} className="teacher-card">
              <div className="teacher-card-main">
                <span className={`teacher-avatar teacher-avatar-${index % 4}`}>{teacher.name.trim().charAt(0).toUpperCase() || "T"}</span>
                <div className="teacher-identity"><h3>{teacher.name}</h3><p>@{teacher.username}</p></div>
                <span className={`teacher-status ${teacher.active ? "is-active" : "is-disabled"}`}><i />{teacher.active ? "Active" : "Disabled"}</span>
              </div>

              <div className="teacher-card-info">
                <label className="teacher-section-control"><span>Assigned section</span><select aria-label={`Section for ${teacher.name}`} value={teacher.sectionId || ""} onChange={(event) => void patch(teacher, { sectionId: event.target.value || null })}><option value="">Unassigned</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label>
                <div className="teacher-info-cell"><span>Messaging permission</span><button className={`permission-pill ${teacher.canSend ? "permission-on" : "permission-off"}`} onClick={() => void patch(teacher, { canSend: !teacher.canSend })}>{teacher.canSend ? "Allowed" : "Disabled"}</button></div>
                <div className="teacher-info-cell"><span>Sender phone</span><b className={teacher.gatewayConfigured ? "teacher-phone-value" : "teacher-muted-value"}>{teacher.senderNumber || "Not configured"}</b></div>
                <div className="teacher-info-cell"><span>Last connection test</span><b className="teacher-test-result"><i className={teacher.lastTestAt ? teacher.lastTestOk ? "test-passed" : "test-failed" : "test-unknown"} />{teacher.lastTestAt ? `${teacher.lastTestOk ? "Passed" : "Failed"} · ${formatDate(teacher.lastTestAt)}` : "Never tested"}</b></div>
                <div className="teacher-info-cell"><span>Last login</span><b>{formatDate(teacher.lastLoginAt)}</b></div>
              </div>

              <div className="teacher-card-footer">
                <span className={`gateway-status ${teacher.gatewayConfigured ? "gateway-ready" : "gateway-missing"}`}><Activity size={14} />{teacher.gatewayConfigured ? "Phone configured" : "Phone not configured"}</span>
                <div className="teacher-actions">
                  <button onClick={() => void patch(teacher, { resetPassword: true })}><KeyRound size={14} />Reset password</button>
                  <button onClick={() => void patch(teacher, { active: !teacher.active })}>{teacher.active ? "Disable access" : "Enable access"}</button>
                  <button className="teacher-remove-button" onClick={() => void remove(teacher)}>Remove</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="teachers-empty"><span><UsersRound size={24} /></span><h3>No teacher accounts yet</h3><p>Create a teacher login above and assign their section.</p></div>
      )}

      {credentials && (
        <div role="dialog" aria-modal="true" aria-labelledby="teacher-credentials-title" className="credentials-overlay">
          <section className="credentials-dialog">
            <button className="credentials-close" onClick={() => setCredentials(null)} aria-label="Close"><X size={18} /></button>
            <span className="credentials-success-icon"><Check size={20} /></span>
            <p className="eyebrow">LOGIN READY</p>
            <h2 id="teacher-credentials-title">Save teacher sign-in</h2>
            <p className="credentials-summary">The password is shown once and cannot be retrieved later. Save it securely for {credentials.name} · {credentials.section}.</p>
            <div className="credential-value"><span><small>Username</small><b>{credentials.username}</b></span><button onClick={() => void copy(credentials.username)} aria-label="Copy username"><Copy size={16} /></button></div>
            <div className="credential-value"><span><small>Password</small><b>{credentials.password}</b></span><button onClick={() => void copy(credentials.password)} aria-label="Copy password"><Copy size={16} /></button></div>
            <div className="credential-actions"><button onClick={printSlip}><Printer size={15} />Print</button><button onClick={download}><Download size={15} />Download CSV</button><button onClick={() => setCredentials(null)} className="credential-done">Done</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
