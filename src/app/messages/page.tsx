"use client";

import { useEffect, useState } from "react";
import { AlertCircle, MessageSquareText, Radio, Send, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import UnfinishedSendBanner from "@/app/components/unfinished-send-banner";

type Log = {
  id: string;
  senderName: string;
  channel: string;
  status: string;
  mode: string | null;
  toNumber: string;
  createdAt: string;
  student: { name: string; section: { name: string } };
  batch: { testMode: boolean };
  error: string | null;
  attendance: number | null;
  attendanceSource: string;
  attendanceStatus: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessagesPage() {
  const [rows, setRows] = useState<Log[]>([]);
  const [error, setError] = useState("");
  const [readyCount, setReadyCount] = useState(0);

  useEffect(() => {
    let active = true;
    void fetch("/api/messages/prepared").then(r=>r.json()).then(d=>{if(active)setReadyCount((d.messages||[]).filter((m:{status:string})=>m.status==="READY").length)}).catch(()=>{});
    void fetch("/api/messages")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (active) setRows(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load message history.");
      });
    return () => {
      active = false;
    };
  }, []);

  const testCount = rows.filter((row) => row.batch.testMode).length;
  const liveCount = rows.length - testCount;

  return (
    <main className="messages-page">
      <PageHeader className="messages-heading" eyebrow="COMMUNICATION" title="Messages" subtitle="Review delivery activity and see which account sent each message." actions={<div className="messages-heading-icon" aria-hidden="true"><MessageSquareText size={22} /></div>} />
      <UnfinishedSendBanner />

      {error && <div role="alert" className="messages-error"><AlertCircle size={17} /><span>{error}</span></div>}

      <section className="message-log-card" aria-label="Message history">
        <div className="message-log-topline">
          <div><h2>Message history</h2><p>Sender names and test mode are recorded for every recipient.</p></div>
          <div className="message-log-count"><span>{readyCount}</span> ready to send · {rows.length} records</div>
        </div>
        <div className="message-summary-strip">
          <div><span className="message-summary-icon"><Send size={15} /></span><span><small>Total messages</small><b>{rows.length}</b></span></div>
          <div><span className="message-summary-icon live-summary"><Radio size={15} /></span><span><small>Live sends</small><b>{liveCount}</b></span></div>
          <div><span className="message-summary-icon test-summary"><ShieldCheck size={15} /></span><span><small>Test sends</small><b>{testCount}</b></span></div>
        </div>

        <div className="message-table-scroll">
          <table className="message-table">
            <thead><tr><th>Student</th><th>Section</th><th>Attendance</th><th>Attendance status</th><th>Channel</th><th>Status</th><th>Sent by</th><th>Recipient</th><th>Mode</th><th>Sent at</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="message-student-cell"><b>{row.student.name}</b></td>
                  <td><span className="message-section-chip">{row.student.section.name}</span></td>
                  <td>{row.attendance===null?"—":`${row.attendance}%`} {row.attendanceSource&&<small className="attendance-source-tag">{row.attendanceSource}</small>}</td>
                  <td>{row.attendanceStatus}</td>
                  <td><span className="message-channel-chip">{row.channel}</span></td>
                  <td><span className={`message-status-chip ${row.status.toLowerCase()}`}>{row.status.toLowerCase().replace(/_/g, " ")}</span>{row.error && <span className="message-error-hint" title={row.error} aria-label={`Error: ${row.error}`}><AlertCircle size={14} /></span>}</td>
                  <td className="message-sender-cell">{row.senderName}</td>
                  <td className="message-recipient-cell">{row.toNumber || "—"}</td>
                  <td><span className={`message-mode-chip ${row.batch.testMode ? "is-test" : "is-live"}`}>{row.batch.testMode ? "Test" : "Live"}</span>{row.mode && <small>{row.mode}</small>}</td>
                  <td className="message-time-cell">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
              {!rows.length && !error && <tr><td colSpan={10} className="message-empty-cell"><span><MessageSquareText size={22} /></span><b>No messages recorded yet</b><small>Messages you send will appear here with sender and delivery details.</small></td></tr>}
            </tbody>
          </table>
        </div>
        <p className="message-table-footnote">Scroll horizontally to view all columns on smaller screens.</p>
      </section>
    </main>
  );
}
