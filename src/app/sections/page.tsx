"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  Download,
  GraduationCap,
  Layers3,
  Pencil,
  Plus,
  Printer,
  ShieldAlert,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { PageHeader } from "@/app/components/ui";

type Section = {
  id: string;
  name: string;
  studentCount: number;
  detainedCount: number;
  teachers: { id: string; name: string; username: string }[];
  dataAsOf: string | null;
};

type Credentials = { name: string; username: string; password: string; section: string };

export default function SectionsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [name, setName] = useState("");
  const [createTeacher, setCreateTeacher] = useState(true);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/sections");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setSections(data);
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/sections")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (active) setSections(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load sections.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function add() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, createTeacherLogin: createTeacher }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setName("");
      setError("");
      if (data.credentials) setCredentials(data.credentials);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add this section.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(section: Section) {
    const nextName = window.prompt("Enter the new section name", section.name);
    if (!nextName?.trim()) return;
    const response = await fetch(`/api/sections/${section.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName.trim() }),
    });
    const data = await response.json();
    if (!response.ok) setError(data.error);
    else await load();
  }

  async function remove(section: Section) {
    const confirmation = window.prompt(
      `This removes ${section.studentCount} students and unassigns teachers. Type ${section.name} to confirm.`,
    );
    if (confirmation === null) return;
    const response = await fetch(`/api/sections/${section.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: confirmation }),
    });
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

  function print() {
    if (!credentials) return;
    const printWindow = window.open("", "_blank", "width=600,height=400");
    if (!printWindow) return;
    printWindow.document.write(
      `<h1>Teacher sign-in</h1><p>${credentials.name} · ${credentials.section}</p><p>Username: ${credentials.username}</p><p>Password: ${credentials.password}</p>`,
    );
    printWindow.document.close();
    printWindow.print();
  }

  const totalStudents = sections.reduce((sum, section) => sum + section.studentCount, 0);
  const assignedSections = sections.filter((section) => section.teachers.length > 0).length;

  return (
    <main className="sections-page">
      <PageHeader className="sections-heading" eyebrow="ORGANIZATION" title="Sections" subtitle="Keep student records, attendance follow-up, and class teachers organized by section." actions={<div className="sections-heading-icon" aria-hidden="true"><Layers3 size={23} /></div>} />

      <section className="section-create-card" aria-labelledby="create-section-title">
        <div className="section-create-intro">
          <span className="section-create-icon"><Plus size={19} /></span>
          <div>
            <h2 id="create-section-title">Create a section</h2>
            <p>Add a class group and optionally create its teacher login.</p>
          </div>
        </div>
        <div className="section-create-form">
          <label className="section-name-field">
            <span>Section name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void add(); }} placeholder="e.g. FYBSc Computer Science" />
          </label>
          <label className="teacher-login-option">
            <input type="checkbox" checked={createTeacher} onChange={(event) => setCreateTeacher(event.target.checked)} />
            <span>Create class teacher login</span>
          </label>
          <button onClick={() => void add()} disabled={!name.trim() || busy} className="section-add-button"><Plus size={16} />{busy ? "Adding…" : "Add section"}</button>
        </div>
      </section>

      {error && <div role="alert" className="sections-error"><ShieldAlert size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss message"><X size={16} /></button></div>}

      <div className="sections-list-heading">
        <div><p className="eyebrow">YOUR ORGANIZATION</p><h2>All sections <span>{sections.length}</span></h2></div>
        <div className="sections-overview-stats"><span><UsersRound size={15} />{totalStudents} students</span><span><BookOpenCheck size={15} />{assignedSections} teachers assigned</span></div>
      </div>

      {sections.length ? (
        <div className="sections-grid">
          {sections.map((section, index) => (
            <article key={section.id} className="section-card">
              <div className="section-card-top">
                <span className={`section-card-mark section-card-mark-${index % 4}`}><GraduationCap size={20} /></span>
                <div className="section-card-title"><p>CLASS SECTION</p><h3>{section.name}</h3></div>
                <span className="section-card-index">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="section-card-metrics">
                <div><span>Students</span><b>{section.studentCount}</b></div>
                <div><span>Below threshold</span><b className={section.detainedCount ? "detained-number" : ""}>{section.detainedCount}</b></div>
              </div>
              <div className="section-card-details">
                <div className="section-detail-row"><UsersRound size={15} /><span><small>Class teacher</small><b>{section.teachers.map((teacher) => teacher.name).join(", ") || "Not assigned"}</b></span></div>
                <div className="section-detail-row"><CalendarDays size={15} /><span><small>Student list updated</small><b>{section.dataAsOf ? new Date(section.dataAsOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No list uploaded yet"}</b></span></div>
              </div>
              <div className="section-card-actions">
                <a href={`/sections/${section.id}`} className="section-open-link">Open section <ArrowUpRight size={15} /></a>
                <button onClick={() => void rename(section)} aria-label={`Rename ${section.name}`} title="Rename"><Pencil size={15} /></button>
                <button onClick={() => void remove(section)} className="section-delete-button" aria-label={`Delete ${section.name}`} title="Delete"><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="sections-empty"><span><ClipboardList size={25} /></span><h3>No sections yet</h3><p>Create your first section above to start organizing students and attendance.</p></div>
      )}

      {credentials && (
        <div role="dialog" aria-modal="true" aria-labelledby="credentials-title" className="credentials-overlay">
          <section className="credentials-dialog">
            <button className="credentials-close" onClick={() => setCredentials(null)} aria-label="Close"><X size={18} /></button>
            <span className="credentials-success-icon"><Check size={20} /></span>
            <p className="eyebrow">SECTION CREATED</p>
            <h2 id="credentials-title">Save teacher sign-in</h2>
            <p className="credentials-summary">These credentials are shown once. Save them securely for {credentials.name} · {credentials.section}.</p>
            <div className="credential-value"><span><small>Username</small><b>{credentials.username}</b></span><button onClick={() => void copy(credentials.username)} aria-label="Copy username"><Copy size={16} /></button></div>
            <div className="credential-value"><span><small>Password</small><b>{credentials.password}</b></span><button onClick={() => void copy(credentials.password)} aria-label="Copy password"><Copy size={16} /></button></div>
            <div className="credential-actions"><button onClick={print}><Printer size={15} />Print</button><button onClick={download}><Download size={15} />Download CSV</button><button onClick={() => setCredentials(null)} className="credential-done">Done</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
