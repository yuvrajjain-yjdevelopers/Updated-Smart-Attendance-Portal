"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSmsUrl, buildWhatsAppUrl, GOOGLE_MESSAGES_URL } from "@/lib/sendCenter";
import { normalizeIndianMobile } from "@/lib/phone";
import { getSmsMetrics, MAX_SMS_PARTS } from "@/lib/messageTemplates";

type Student = { id: string; name: string; regNo: string; parentMobile: string; avgAtt: number | null; isDetained: boolean; statusLabel: string; attendanceSourceLabel: string; absentDaysThisMonth?: number; smsStatus?: string; whatsappStatus?: string };
type Prepared = { id: string; studentId: string; name: string; regNo: string; avgAtt: number | null; attendanceSource: "LIST" | "ROSTER" | "NONE"; attendanceSourceLabel: string; statusLabel: string; section: string; channel: "SMS" | "WHATSAPP"; status: string; toNumber: string | null; text: string; excludeReason?: string | null };
type Queue = { id: string; preparedId: string; name: string; regNo: string; avgAtt: number | null; statusLabel: string; section: string; toNumber: string; text: string; channel: "SMS" | "WHATSAPP"; status: string };
type PrepareProgress = { processed: number; total: number; prepared: number };
type Props = { students: Student[]; senderName: string; senderMobile?: string; sectionId: string; mobileLinkMode?: "SMS_LINK" | "GOOGLE_MESSAGES" | "PHONE"; canSend: boolean; isHod?: boolean; kind?: "DETENTION" | "ABSENCE"; date?: string; sendAfter?: string };
type Channel = "SMS" | "WHATSAPP";
type ApiResponse = ReturnType<typeof JSON.parse>;
function toClientMode(mode: "SMS_LINK" | "GOOGLE_MESSAGES" | "PHONE") { return mode === "GOOGLE_MESSAGES" ? "google-messages" : mode === "PHONE" ? "phone" : "sms-link"; }

async function readApiResponse<T = ApiResponse>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) throw new Error(`The server returned an empty response (HTTP ${response.status}). Please retry.`);
  try { return JSON.parse(body) as T; }
  catch { throw new Error(`The server returned an invalid response (HTTP ${response.status}). Please refresh and retry.`); }
}

export default function ClassMessaging({ students, senderName, senderMobile = "", sectionId, mobileLinkMode = "SMS_LINK", canSend, isHod = false, kind = "DETENTION", date = "", sendAfter = "" }: Props) {
  const [prepared, setPrepared] = useState<Prepared[]>([]);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [review, setReview] = useState(false);
  const [queue, setQueue] = useState<Queue[]>([]);
  const [cursor, setCursor] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [mode, setMode] = useState("sms-link");
  const [testMode, setTestMode] = useState(true);
  const [testNumber, setTestNumber] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [copied, setCopied] = useState("");
  const [filter, setFilter] = useState("");
  const [preparationMs, setPreparationMs] = useState<number | null>(null);
  const [prepareProgress, setPrepareProgress] = useState<PrepareProgress | null>(null);
  const [editingPrepared, setEditingPrepared] = useState<string[]>([]);
  const [dirtyPrepared, setDirtyPrepared] = useState<string[]>([]);
  const [expandedPrepared, setExpandedPrepared] = useState<string[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [sendAgain, setSendAgain] = useState(false);
  const [flowKind, setFlowKind] = useState(kind);
  const [flowDate, setFlowDate] = useState(date);
  const [setupOpen, setSetupOpen] = useState(false);
  const [connectionKind, setConnectionKind] = useState<"WHATSAPP_WEB" | "MOBILE_LINK">("MOBILE_LINK");
  const [conflictSession, setConflictSession] = useState<{ id: string; sectionId: string; sectionName: string; channel: Channel } | null>(null);
  const reusedWindow = useRef<Window | null>(null);
  const selectedIds = selected ?? (flowKind === "ABSENCE" ? students.filter(student => !["Sent", "Sent by user", "Opened"].includes(student.smsStatus || "") && !["Sent", "Sent by user", "Opened"].includes(student.whatsappStatus || "")).map(student => student.id) : []);

  const loadSession = useCallback(async (id: string) => {
    const response = await fetch(`/api/send-sessions/${id}`, { cache: "no-store" });
    const data = await readApiResponse(response);
    if (!response.ok) throw new Error(data.error || "Could not resume this send.");
    setSessionId(data.session.id);
    setFlowKind(data.session.kind || kind);
    if (data.session.date) setFlowDate(data.session.date);
    setChannel(data.session.channel);
    setQueue(data.queue);
    setCursor(data.currentQueueIndex);
    setConnectionKind(data.connectionKind);
    setMode(toClientMode(data.session.mobileLinkMode));
    setTestMode(data.session.testMode);
    setReview(false);
    setSetupOpen(data.session.status === "PAUSED_SETUP");
    localStorage.setItem("attendance-active-send", data.session.id);
  }, [kind]);

  useEffect(() => {
    queueMicrotask(() => setMode(toClientMode(mobileLinkMode)));
    void fetch("/api/auth/me").then(readApiResponse).then(data => { setTestMode(data.testMode !== false); setTestNumber(data.testNumber || ""); }).catch(() => {});
    const resumeId = new URLSearchParams(window.location.search).get("resumeSession");
    if (resumeId) queueMicrotask(() => { void loadSession(resumeId).catch(error => setNotice(error instanceof Error ? error.message : "Could not resume this send.")); });
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const activeId = sessionId || localStorage.getItem("attendance-active-send");
      if (activeId) void loadSession(activeId).catch(() => {});
      void fetch("/api/send-sessions", { cache: "no-store" }).then(readApiResponse).then(data => {
        if (!activeId && data.sessions?.length) setNotice(`Unfinished ${data.sessions[0].channel} send is available. Resume it from the unfinished-send banner.`);
      }).catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [loadSession, mobileLinkMode, sessionId]);

  const visibleStudents = students.filter(student => `${student.name} ${student.regNo}`.toLowerCase().includes(filter.toLowerCase()));
  const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every(student => selectedIds.includes(student.id));
  const selectedStudents = students.filter(student => selectedIds.includes(student.id));
  const missing = selectedStudents.filter(student => { try { normalizeIndianMobile(student.parentMobile); return false; } catch { return true; } });
  const ready = useMemo(() => prepared.filter(message => message.status === "READY" && message.toNumber && !excluded.includes(message.id)), [prepared, excluded]);
  const oversizedSms = channel === "SMS" ? ready.filter(message => getSmsMetrics(message.text).parts > MAX_SMS_PARTS) : [];
  const current = queue[cursor];
  const preparing = loading && preparationMs === null;

  async function chooseMode(value: string) {
    setMode(value);
    setModeSaving(true);
    const modeValue = value === "google-messages" ? "GOOGLE_MESSAGES" : value === "phone" ? "PHONE" : "SMS_LINK";
    try { const response = await fetch("/api/settings/connections", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "MOBILE_LINK", action: "SET_MODE", mode: modeValue }) }); if (!response.ok) setNotice("Could not save this mobile link mode in Settings."); }
    catch { setNotice("Could not save this mobile link mode in Settings."); }
    finally { setModeSaving(false); }
  }

  async function prepare(channelToPrepare: Channel) {
    setChannel(channelToPrepare);
    setReview(true);
    setPrepared([]);
    setExcluded([]);
    setPreparationMs(null);
    setPrepareProgress({ processed: 0, total: selectedIds.length, prepared: 0 });
    setLoading(true);
    const started = performance.now();
    try {
      const params = new URLSearchParams({ studentIds: selectedIds.join(","), sectionId, channel: channelToPrepare, stream: "1", kind: flowKind, ...(flowKind === "ABSENCE" ? { date: flowDate, sendAgain: sendAgain ? "1" : "0" } : {}) });
      const response = await fetch(`/api/messages/prepared?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) { const error = await readApiResponse(response); throw new Error(error.error || "Could not prepare selected messages."); }
      let data: { messages: Prepared[]; preparedMs: number; testMode: boolean; testNumber: string } | null = null;
      if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() || "";
          for (const frame of frames) {
            const line = frame.split(/\r?\n/).find(item => item.startsWith("data: "));
            if (!line) continue;
            const event = JSON.parse(line.slice(6));
            if (event.type === "progress") setPrepareProgress(event.progress);
            if (event.type === "error") throw new Error(event.message || "Could not prepare selected messages.");
            if (event.type === "complete") data = event.data;
          }
          if (done) break;
        }
      } else {
        data = await readApiResponse<{ messages: Prepared[]; preparedMs: number; testMode: boolean; testNumber: string }>(response);
      }
      if (!data) throw new Error("The server closed the preparation stream before it finished.");
      setPrepared(data.messages || []);
      setDirtyPrepared([]);
      setExpandedPrepared(data.messages?.[0]?.id ? [data.messages[0].id] : []);
      setPreparationMs(Math.max(data.preparedMs ?? 0, Math.round(performance.now() - started)));
      setPrepareProgress({ processed: selectedIds.length, total: selectedIds.length, prepared: data.messages.length });
      setTestMode(data.testMode !== false);
      setTestNumber(data.testNumber || "");
    } catch (error) { setPrepareProgress(null); setNotice(error instanceof Error ? error.message : "Could not prepare selected messages."); }
    finally { setLoading(false); }
  }

  async function saveEditedMessages() {
    const dirty = ready.filter(message => dirtyPrepared.includes(message.id));
    for (const message of dirty) {
      const response = await fetch(`/api/messages/prepared/${message.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: message.text }) });
      if (!response.ok) {
        let reason = `Could not save ${message.name}'s edited message (HTTP ${response.status}).`;
        try { const data = await readApiResponse(response); reason = data.error || reason; } catch (error) { if (error instanceof Error) reason = error.message; }
        throw new Error(reason);
      }
    }
    setDirtyPrepared(value => value.filter(id => !dirty.some(message => message.id === id)));
  }

  async function startQueue() {
    if (!channel || !ready.length) return;
    if (channel === "SMS" && oversizedSms.length) { setNotice(`Shorten each SMS to a maximum of ${MAX_SMS_PARTS} parts before sending.`); return; }
    setLoading(true);
    setConflictSession(null);
    try {
      await saveEditedMessages();
      const response = await fetch("/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preparedIds: prepared.map(item => item.id), excludedIds: excluded, channel, kind: flowKind, sendAgain }) });
      const data = await readApiResponse(response);
      if (response.status === 409 && data.activeSession) { setConflictSession(data.activeSession); return; }
      if (!response.ok) throw new Error(data.error || "Could not start the send session.");
      setSessionId(data.sessionId);
      setQueue(data.queue || []);
      setCursor(data.currentIndex || 0);
      setConnectionKind(data.connectionKind);
      setMode(toClientMode(data.mobileLinkMode));
      setNotice(`${data.queue?.length || 0} messages prepared in ${preparationMs ?? 0} ms${data.testMode ? " · TEST MODE" : ""}`);
      setReview(false);
      setSelected([]);
      localStorage.setItem("attendance-active-send", data.sessionId);
      if (!data.connectionConfirmed) setSetupOpen(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not start the send session."); }
    finally { setLoading(false); }
  }

  async function sessionAction(action: "CONFIRM" | "OPEN_ANYWAY" | "NOT_WORKING" | "DISCARD") {
    if (!sessionId) return;
    const response = await fetch(`/api/send-sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await readApiResponse(response);
    if (!response.ok) { setNotice(data.error || "Could not update the send session."); return; }
    if (action === "DISCARD") { setQueue([]); setCursor(0); setSessionId(""); setSetupOpen(false); localStorage.removeItem("attendance-active-send"); return; }
    setSetupOpen(false);
    if (action === "OPEN_ANYWAY" || action === "CONFIRM") await openCurrent(true);
  }

  async function updateCurrent(status: "OPENED" | "SENT_BY_USER" | "SKIPPED" | "FAILED", advance = false) {
    if (!current || !sessionId) return;
    const response = await fetch(`/api/send-sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "PROGRESS", logId: current.id, status, mode: current.channel === "WHATSAPP" ? (/Android|iPhone|iPad/i.test(navigator.userAgent) ? "whatsapp-phone" : "whatsapp-web") : mode, advance }) });
    const data = await readApiResponse(response);
    if (!response.ok) { setNotice(data.error || "Could not save send progress."); return; }
    await loadSession(sessionId);
    if (data.sessionStatus === "COMPLETED") { setNotice("Send queue complete. Delivery status is based on the actions you confirmed."); localStorage.removeItem("attendance-active-send"); }
  }

  async function openCurrent(bypassCheck = false) {
    if (!current || !sessionId) return;
    const target = reusedWindow.current && !reusedWindow.current.closed ? reusedWindow.current : window.open("about:blank", "attendance_messaging_window", "popup,width=1100,height=800");
    if (target) reusedWindow.current = target;
    if (!bypassCheck) {
      const response = await fetch(`/api/send-sessions/${sessionId}`, { cache: "no-store" });
      const state = await readApiResponse(response);
      if (!response.ok) { target?.close(); setNotice(state.error || "Could not verify the sending session."); return; }
      if (!state.connectionConfirmed) {
        target?.close();
        await fetch(`/api/send-sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "NOT_WORKING" }) });
        setSetupOpen(true);
        return;
      }
    }
    let url: string;
    if (current.channel === "WHATSAPP") url = buildWhatsAppUrl(current.toNumber, current.text, /Android|iPhone|iPad/i.test(navigator.userAgent) ? "phone" : "desktop");
    else if (mode === "google-messages") url = GOOGLE_MESSAGES_URL;
    else url = buildSmsUrl(current.toNumber, current.text, /iPhone|iPad/i.test(navigator.userAgent) ? "iphone" : "android");
    if (target) target.location.href = url;
    await updateCurrent("OPENED");
    if (current.channel === "SMS" && mode === "google-messages") {
      await navigator.clipboard?.writeText(current.text).catch(() => {});
      setNotice("Google Messages opened. Copy the recipient and message, send it, then return here.");
    } else setNotice("Opened the message link. Delivery cannot be detected; send it in the messaging app, then return here.");
  }

  async function connectionTrouble() {
    if (!sessionId) return;
    const response = await fetch(`/api/send-sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "NOT_WORKING" }) });
    if (!response.ok) { setNotice("Could not update connection status."); return; }
    setSetupOpen(true);
  }

  function openWhatsAppWeb() {
    const tab = reusedWindow.current && !reusedWindow.current.closed ? reusedWindow.current : window.open("https://web.whatsapp.com", "attendance_messaging_window", "popup,width=1100,height=800");
    if (tab) reusedWindow.current = tab;
  }

  function testSmsLink() {
    try {
      if (mode === "google-messages") {
        const tab = reusedWindow.current && !reusedWindow.current.closed ? reusedWindow.current : window.open(GOOGLE_MESSAGES_URL, "attendance_messaging_window", "popup,width=1100,height=800");
        if (tab) reusedWindow.current = tab;
        return;
      }
      const number = normalizeIndianMobile(senderMobile || testNumber);
      const tab = reusedWindow.current && !reusedWindow.current.closed ? reusedWindow.current : window.open("about:blank", "attendance_messaging_window", "popup,width=900,height=700");
      if (tab) { reusedWindow.current = tab; tab.location.href = buildSmsUrl(number, "Smart Attendance SMS link test"); }
    } catch { setNotice("Add your mobile number in Settings to test the SMS link."); }
  }

  async function editPrepared(message: Prepared, text: string) {
    setPrepared(rows => rows.map(row => row.id === message.id ? { ...row, text } : row));
    const response = await fetch(`/api/messages/prepared/${message.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (!response.ok) {
      let reason = `Could not save ${message.name}'s edit (HTTP ${response.status}).`;
      try { const data = await readApiResponse(response); reason = data.error || reason; } catch (error) { if (error instanceof Error) reason = error.message; }
      setNotice(reason);
      return false;
    }
    setDirtyPrepared(value => value.filter(id => id !== message.id));
    return true;
  }

  async function editQueue(message: Queue, text: string) {
    setQueue(rows => rows.map(row => row.id === message.id ? { ...row, text } : row));
    const response = await fetch(`/api/messages/prepared/${message.preparedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (!response.ok) setNotice("Could not save this message edit.");
  }

  async function copy(value: string, label: string) { try { await navigator.clipboard.writeText(value); setCopied(`${label} copied`); } catch { setCopied("Select and copy the text manually"); } }

  return <div className="message-workflow">
    {isHod && <details className="send-debug-disclosure" onToggle={event => setDebugOpen(event.currentTarget.open)}><summary>Debug message preview and URLs</summary>{debugOpen && prepared.map(message => <article key={message.id}><b>{message.name} · {message.channel}</b><p>Attendance: {message.avgAtt === null ? "No data" : `${message.avgAtt}%`} · {message.attendanceSource} · {message.statusLabel}</p><label>Exact text<textarea readOnly rows={5} value={message.text}/></label>{message.toNumber && <><label>SMS URL<code>{buildSmsUrl(message.toNumber, message.text, "android")}</code></label><label>WhatsApp URL<code>{buildWhatsAppUrl(message.toNumber, message.text, "desktop")}</code></label></>}</article>)}</details>}
    <div className="message-send-toolbar">
      <label><input type="checkbox" checked={allVisibleSelected} onChange={event => setSelected(value => event.target.checked ? [...new Set([...(value ?? selectedIds), ...visibleStudents.map(student => student.id)])] : (value ?? selectedIds).filter(id => !visibleStudents.some(student => student.id === id)))}/> Select all shown students</label>
      <input aria-label="Filter students" placeholder="Filter by name or registration" value={filter} onChange={event => setFilter(event.target.value)}/>
      <button type="button" onClick={() => setSelected(value => [...new Set([...(value ?? selectedIds), ...visibleStudents.map(student => student.id)])])}>Select filtered</button>
      <span>{selectedIds.length} selected · {missing.length} missing/invalid parent numbers</span>
      <button disabled={!canSend || !selectedIds.length || loading} className="message-action-primary" onClick={() => void prepare("SMS")}>Send SMS</button>
      <button disabled={!canSend || !selectedIds.length || loading} className="message-action-whatsapp" onClick={() => void prepare("WHATSAPP")}>Send WhatsApp</button>
      {flowKind === "ABSENCE" && <label><input type="checkbox" checked={sendAgain} onChange={event => { setSendAgain(event.target.checked); if (event.target.checked) setSelected(students.map(student => student.id)); else setSelected(students.filter(student => !["Sent", "Sent by user", "Opened"].includes(student.smsStatus || "") && !["Sent", "Sent by user", "Opened"].includes(student.whatsappStatus || "")).map(student => student.id)); }} /> Send again to students already messaged</label>}
      {flowKind === "ABSENCE" && sendAfter && <span>Available after {sendAfter}</span>}
      {!canSend && <span className="message-permission-note">Your account cannot send messages.</span>}
    </div>

    {channel && review && <section role="dialog" aria-modal="true" className="message-confirm-panel">
      <span className="eyebrow">SEND CENTER · {channel} · {flowKind === "ABSENCE" ? "ABSENCE · " : ""}English + हिन्दी + मराठी</span>
      <h2>Review recipients and message</h2>
      <p><strong>Parents&apos; numbers: {ready.length} students</strong></p>
      {testMode && <p className="message-test-badge">TEST MODE: everything goes to {testNumber || "test number not set"}</p>}
      {testMode && <p className="message-test-badge">TEST MODE · test number receives every message</p>}
      {preparationMs !== null && <p role="status">Prepared {prepared.length} messages in {preparationMs} ms</p>}
      {preparing && <div className="send-preparation-status" role="status" aria-live="polite"><div><b>Preparing {channel === "SMS" ? "SMS" : "WhatsApp"} messages</b><span>{prepareProgress?.prepared ?? 0} messages ready · {prepareProgress?.processed ?? 0} of {prepareProgress?.total ?? selectedIds.length} students checked</span></div><progress value={prepareProgress?.processed ?? 0} max={Math.max(prepareProgress?.total ?? selectedIds.length, 1)} /><small>Building personalized message text…</small></div>}
      {!preparing && <>
        {missing.length > 0 && <aside className="send-excluded-list"><b>Excluded · missing or invalid parent number</b>{missing.map(student => <span key={student.id}>{student.name} · {student.regNo} — no valid parent number</span>)}</aside>}
        {prepared.map(message => <article className="send-prepared-item" key={message.id}>
          <header><div><b>{message.name}</b><small>{message.regNo} · {message.toNumber ? `+${message.toNumber}` : message.excludeReason || "No valid parent number"}</small></div><span>{message.avgAtt === null ? "No data" : `${message.avgAtt}%`} · {message.statusLabel}</span></header>
          {expandedPrepared.includes(message.id) || editingPrepared.includes(message.id)
            ? <textarea aria-label={`Message for ${message.name}`} rows={5} readOnly={!editingPrepared.includes(message.id)} value={message.text} onChange={event => { const text = event.target.value; setPrepared(rows => rows.map(row => row.id === message.id ? { ...row, text } : row)); setDirtyPrepared(value => value.includes(message.id) ? value : [...value, message.id]); }}/>
            : <p className="prepared-message-snippet">{message.text.slice(0, 220)}{message.text.length > 220 ? "…" : ""}</p>}
          <div className="prepared-message-actions"><button type="button" className="message-action-secondary" onClick={() => setExpandedPrepared(value => value.includes(message.id) ? value.filter(id => id !== message.id) : [...value, message.id])}>{expandedPrepared.includes(message.id) ? "Hide preview" : "Preview message"}</button><button type="button" className="message-action-secondary" onClick={() => { if (editingPrepared.includes(message.id)) { void (async () => { if (await editPrepared(message, message.text)) setEditingPrepared(value => value.filter(id => id !== message.id)); })(); } else { setExpandedPrepared(value => value.includes(message.id) ? value : [...value, message.id]); setEditingPrepared(value => [...value, message.id]); } }}>{editingPrepared.includes(message.id) ? "Save edit" : "Edit"}</button><button type="button" className="message-action-secondary" onClick={() => setExcluded(value => value.includes(message.id) ? value.filter(id => id !== message.id) : [...value, message.id])}>{excluded.includes(message.id) ? "Include" : "Exclude"}</button></div>
        </article>)}
      </>}
      {channel === "SMS" && ready[0] && <small className={oversizedSms.length ? "template-counter counter-warning" : "template-counter"}>{getSmsMetrics(ready[0].text).characters} {getSmsMetrics(ready[0].text).encoding} units · {getSmsMetrics(ready[0].text).parts} SMS parts{oversizedSms.length ? ` · ${oversizedSms.length} message(s) exceed the ${MAX_SMS_PARTS}-part limit` : ""}</small>}
      {channel === "SMS" && <label>Mobile link mode<select value={mode} onChange={event => chooseMode(event.target.value)}><option value="sms-link">SMS link</option><option value="google-messages">Google Messages for web (copy and paste)</option><option value="phone">Phone</option></select></label>}
      {flowKind === "ABSENCE" && <label className="message-send-again"><input type="checkbox" checked={sendAgain} onChange={event => setSendAgain(event.target.checked)} /> Send again to students already messaged</label>}
      <div className="message-confirm-actions"><button disabled={!ready.length || loading || modeSaving || oversizedSms.length > 0 || editingPrepared.length > 0 || dirtyPrepared.length > 0} onClick={() => void startQueue()} className="message-action-primary">{loading ? "Preparing…" : modeSaving ? "Saving mode…" : editingPrepared.length || dirtyPrepared.length ? "Save edits before sending" : "Start sending"}</button><button onClick={() => { setChannel(null); setReview(false); setPrepared([]); setExcluded([]); setDirtyPrepared([]); setEditingPrepared([]); }} className="message-action-secondary">Cancel</button></div>
    </section>}

    {conflictSession && <aside className="send-setup-dialog"><b>Unfinished send found</b><p>{conflictSession.sectionName} · {conflictSession.channel}</p><button onClick={() => { void loadSession(conflictSession.id); setConflictSession(null); }}>Resume old send</button><button onClick={async () => { await fetch(`/api/send-sessions/${conflictSession.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "DISCARD" }) }); setConflictSession(null); }}>Discard old send</button></aside>}

    {sessionId && queue.length > 0 && <section className="message-queue" aria-label="Send queue">
      <div className="message-queue-head"><h2>{channel} send queue</h2><span>{cursor} of {queue.length} done · saved for resume</span><progress value={cursor} max={queue.length}/></div>
      {current ? <article className="message-queue-card">
        <p><b>{current.name}</b> · {current.regNo} · {flowKind === "ABSENCE" ? "Absent " + flowDate : current.avgAtt === null ? "No data" : `${current.avgAtt}%`} · {current.statusLabel} · +{current.toNumber.slice(0, 2)} {current.toNumber.slice(2, 7)} {current.toNumber.slice(7)}</p>
        <textarea aria-label="Message text" rows={8} value={current.text} onChange={event => setQueue(rows => rows.map((row, index) => index === cursor ? { ...row, text: event.target.value } : row))} onBlur={event => void editQueue(current, event.currentTarget.value)}/>
        {current.channel === "WHATSAPP" ? <p>Sending from {senderName}&apos;s WhatsApp. Make sure WhatsApp Web is logged in with your own number in this browser. Press Enter in WhatsApp to send, then return here.</p> : mode === "google-messages" ? <div><p>Copy the number and message into Google Messages, send it, then return here.</p><button onClick={() => void copy(`+${current.toNumber}`, "Number")}>Copy number</button> <button onClick={() => void copy(current.text, "Message")}>Copy message</button>{copied && <span role="status">{copied}</span>}</div> : <p>Open the SMS link, press Send in your messaging app, then return here.</p>}
        <div className="message-confirm-actions"><button className="message-action-primary" onClick={() => void openCurrent()}>Open</button><button onClick={() => void openCurrent()}>Open again</button><button onClick={() => void updateCurrent("SENT_BY_USER", true)}>Mark as sent · Next</button><button onClick={() => void updateCurrent("SKIPPED", true)}>Skip</button><button className="message-connection-trouble" onClick={() => void connectionTrouble()}>{current.channel === "WHATSAPP" ? "WhatsApp Web asked me to log in" : "SMS app did not open"}</button></div>
      </article> : <p>Queue complete. Delivery cannot be detected; statuses reflect actions you confirmed.</p>}
      <button className="message-action-secondary" onClick={() => void sessionAction("DISCARD")}>Discard send session</button>
    </section>}

    {setupOpen && <div role="dialog" aria-modal="true" className="send-setup-backdrop"><section className="send-setup-dialog">
      <span className="eyebrow">SET UP BEFORE SENDING</span><h2>{connectionKind === "WHATSAPP_WEB" ? "WhatsApp Web" : "Mobile link"}</h2>
      <p>This send is paused and saved at {current?.name || "the current student"}. This portal cannot detect whether the browser or phone is signed in.</p>
      {connectionKind === "WHATSAPP_WEB" ? <><ol><li>Open WhatsApp Web in this browser.</li><li>Scan the QR code with your own WhatsApp account.</li><li>Return here and confirm.</li></ol><button onClick={openWhatsAppWeb}>Open WhatsApp Web</button></> : <><p>Selected mode: {mode}. Make sure your SMS link handler or {mode === "google-messages" ? "Google Messages for web" : "phone messaging app"} is ready.</p><button onClick={testSmsLink}>Test my SMS link</button></>}
      <div className="message-confirm-actions"><button className="message-action-primary" onClick={() => void sessionAction("CONFIRM")}>I&apos;ve {connectionKind === "WHATSAPP_WEB" ? "logged in" : "set it up"}, continue</button><button onClick={() => void sessionAction("OPEN_ANYWAY")}>Open anyway</button><button onClick={() => setSetupOpen(false)} className="message-action-secondary">Pause here</button></div>
    </section></div>}

    {notice && <p role="status" className="message-workflow-notice">{notice}</p>}
    <div className="message-recipient-table-wrap"><table className="message-recipient-table"><thead><tr><th>Select</th><th>Registration</th><th>Student</th><th>Attendance</th><th>Status</th></tr></thead><tbody>{visibleStudents.map(student => <tr key={student.id}><td><input type="checkbox" aria-label={"Select " + student.name} checked={selectedIds.includes(student.id)} onChange={() => setSelected(value => (value ?? selectedIds).includes(student.id) ? (value ?? selectedIds).filter(id => id !== student.id) : [...(value ?? selectedIds), student.id])}/></td><td>{student.regNo}</td><td>{student.name}</td>{flowKind === "ABSENCE" ? <><td><span className="message-kind-chip absence">Absent {flowDate}</span><small className="attendance-source-tag">absent days this month: {student.absentDaysThisMonth || 0}</small></td><td>SMS: {student.smsStatus || "Not sent"} · WhatsApp: {student.whatsappStatus || "Not sent"}</td></> : <><td>{student.avgAtt === null ? "—" : student.avgAtt + "%"} {student.attendanceSourceLabel && <small className="attendance-source-tag">{student.attendanceSourceLabel}</small>}</td><td>{student.statusLabel}</td></>}</tr>)}{!students.length && <tr><td colSpan={5}>{flowKind === "ABSENCE" ? "No absent students for this date." : "No students need follow-up."}</td></tr>}</tbody></table></div>
    {sessionId && current && <div className="message-sticky-next"><button onClick={() => void updateCurrent("SENT_BY_USER", true)}>Next message →</button></div>}
  </div>;
}
