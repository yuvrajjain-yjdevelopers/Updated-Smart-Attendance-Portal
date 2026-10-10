"use client";

import { useState } from "react";

type Preview = {
  blocksFound: number;
  parsedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  unmatched: { regNo: string; name: string; branch: string; avg: number }[];
  detainedCount: number;
  atOrAboveThreshold: number;
  exactly75: number;
  notListed: number;
};

export default function DetentionUploader({ sectionId, sectionName = "this section" }: { sectionId: string; sectionName?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [older, setOlder] = useState(false);
  const [confirmRequired, setConfirmRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  async function request(action: "preview" | "apply" | "add-unmatched", confirmOlder = false) {
    if (!file || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      const isPdf = signature[0] === 37 && signature[1] === 80 && signature[2] === 68 && signature[3] === 70 && signature[4] === 45;
      if (isPdf && ext !== "pdf") { setMessage("This file is a PDF. Rename it with a .pdf extension and choose it again."); return; }
      if (ext !== "pdf" && ext !== "csv" && ext !== "xlsx") { setMessage("Detention lists must be a text-based PDF, CSV, or XLSX workbook."); return; }
      if (ext === "pdf" && !isPdf) { setMessage("The .pdf extension does not match this file's content."); return; }
      if (ext === "csv" && isPdf) { setMessage("This is a PDF. Choose it with its .pdf extension."); return; }
      if (ext === "xlsx" && !(signature[0] === 80 && signature[1] === 75)) { setMessage("The .xlsx extension does not match this file's content."); return; }

      const body: Record<string, unknown> = { fileName: file.name, uptoDate: date, action, confirmOlder };
      if (ext === "pdf" || ext === "xlsx") {
        body.contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("Could not read file"));
          reader.readAsDataURL(file);
        });
      } else body.csv = await file.text();

      const response = await fetch(`/api/sections/${sectionId}/detention`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (response.status === 409 && data.needsOlderConfirmation) {
        setConfirmRequired(true);
        setMessage(data.error || "This list is older than the latest applied list.");
        return;
      }
      if (!response.ok) { setMessage(data.error || "Upload failed. Check the file and try again."); return; }
      if (action === "preview") { setPreview(data); setMessage(""); return; }
      if (action === "add-unmatched") { setMessage(data.message || "Unmatched students added."); return; }
      setMessage(`Applied ${data.matchedCount} students; ${data.detainedCount} are below 75%. ${data.notInSection} unmatched rows were ignored.`);
      setPreview(null);
      setOlder(false);
      setConfirmRequired(false);
      window.location.reload();
    } catch {
      setMessage("Could not read this file. Choose a valid, text-based PDF, CSV, or XLSX workbook.");
    } finally { setBusy(false); }
  }

  return (
    <section className="detention-uploader">
      <div className="detention-heading">
        <div><span className="eyebrow">ATTENDANCE UPDATE</span><h2>Upload detention list</h2><p>Preview the college list, confirm matches, and review who will be marked for follow-up.</p></div>
        <span className="detention-file-badge">PDF · CSV · XLSX</span>
      </div>
      <div className="detention-requirements"><b>Expected columns</b><span>Registration number</span><span>Average attendance</span><span>Detained subjects</span><small>Excel detention workbooks can include the college subject-code legend. Student name, section, and mobile are optional. Scanned PDFs are not supported.</small></div>
      <div className="detention-controls">
        <label className="detention-date-field">List date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <label className="detention-file-picker"><input type="file" accept=".pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); setMessage(""); setConfirmRequired(false); }} /><span>{file ? file.name : "Choose a detention list"}</span><small>{file ? `${(file.size / 1024).toFixed(0)} KB` : "Text PDF, CSV, or XLSX · max 10 MB"}</small></label>
        <button type="button" onClick={() => void request("preview")} disabled={!file || busy} className="detention-primary-button">{busy ? "Reading list…" : "Preview list"}</button>
      </div>
      {message && <p role="status" className="detention-notice">{message}</p>}
      {confirmRequired && <label className="detention-older-confirm"><input type="checkbox" checked={older} onChange={event => setOlder(event.target.checked)} /> I understand this list is older and confirm applying it.</label>}
      {preview && <div className="detention-preview">
        <div className="detention-preview-heading"><div><span className="eyebrow">REVIEW BEFORE APPLYING</span><h3>List preview</h3></div><span>{preview.blocksFound} blocks · {preview.parsedCount} rows</span></div>
        <div className="detention-stats"><div><b>{preview.matchedCount}</b><span>Matched here</span></div><div><b>{preview.detainedCount}</b><span>Below 75%</span></div><div><b>{preview.atOrAboveThreshold}</b><span>At or above</span></div><div><b>{preview.unmatchedCount}</b><span>Unmatched</span></div><div><b>{preview.notListed}</b><span>Not in file</span></div></div>
        {preview.exactly75 > 0 && <p className="detention-threshold-note">{preview.exactly75} student(s) are exactly at the 75% threshold and will not be marked detained.</p>}
        {!!preview.unmatched.length && <div className="detention-unmatched"><div><h4>Unmatched rows</h4><p>These entries do not currently match a student in {sectionName}.</p></div><div className="detention-unmatched-list">{preview.unmatched.slice(0, 30).map(student => <p key={student.regNo}><b>{student.regNo}</b><span>{student.name || "Name not parsed"}</span><span>{student.branch || sectionName}</span><span>{student.avg}%</span></p>)}</div><button type="button" disabled={busy} onClick={() => void request("add-unmatched")} className="detention-secondary-button">Add unmatched students</button></div>}
        <div className="detention-preview-actions"><span>Applying updates attendance and detention status for matched students.</span><button type="button" disabled={busy || (confirmRequired && !older)} onClick={() => void request("apply", older)} className="detention-primary-button">{busy ? "Applying…" : "Apply detention list"}</button></div>
      </div>}
    </section>
  );
}
