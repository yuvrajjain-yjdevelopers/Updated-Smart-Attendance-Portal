"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Session = { id: string; channel: "SMS" | "WHATSAPP"; sectionId: string; sectionName: string; done: number; total: number; status: string; testMode: boolean; role: string };

export default function UnfinishedSendBanner() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const refresh = useCallback(() => {
    if (document.visibilityState === "hidden") return;
    void fetch("/api/send-sessions", { cache: "no-store" }).then(response => response.json()).then(data => setSessions(data.sessions || [])).catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [refresh]);

  async function discard(id: string) {
    const response = await fetch(`/api/send-sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "DISCARD" }) });
    if (response.ok) setSessions(rows => rows.filter(row => row.id !== id));
  }

  if (!sessions.length) return null;
  return <aside className="unfinished-send-banner" aria-label="Unfinished sends">
    {sessions.map(session => <div key={session.id}><p><b>Unfinished send:</b> {session.done} of {session.total} done · {session.channel} · Section {session.sectionName}{session.testMode ? " · Test mode" : ""}</p><div><Link href={session.role === "TEACHER" ? `/my-class?resumeSession=${session.id}` : `/sections/${session.sectionId}?resumeSession=${session.id}`}>Resume</Link><button type="button" onClick={() => void discard(session.id)}>Discard</button></div></div>)}
  </aside>;
}
