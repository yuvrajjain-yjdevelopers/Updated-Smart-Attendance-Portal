"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  MessageSquareText,
  Save,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import { buildSmsUrl, buildWhatsAppUrl } from "@/lib/sendCenter";
import { normalizeIndianMobile } from "@/lib/phone";

type Gateway = {
  configured: boolean;
  mode?: "LOCAL" | "CLOUD";
  baseUrl?: string;
  senderNumber?: string;
  lastTestAt?: string;
  lastSuccessfulTestAt?: string;
  lastTestOk?: boolean;
};
type CollegeSettings = {
  testMode: boolean;
  testNumber: string;
  collegeName: string;
  department: string;
  smsTemplate: string;
  whatsappTemplate: string;
};

const initialCollege: CollegeSettings = {
  testMode: true,
  testNumber: "",
  collegeName: "",
  department: "",
  smsTemplate: "",
  whatsappTemplate: "",
};

export default function SettingsClient({
  name,
  role,
  mobile: initialMobile,
}: {
  name: string;
  role: string;
  mobile: string;
}) {
  const [gateway, setGateway] = useState<Gateway>({ configured: false });
  const [college, setCollege] = useState<CollegeSettings>(initialCollege);
  const [mode, setMode] = useState<"LOCAL" | "CLOUD">("LOCAL");
  const [baseUrl, setBaseUrl] = useState("http://192.168.1.50:8080");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [mobile, setMobile] = useState(initialMobile);
  const [notice, setNotice] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [smsLinkTested, setSmsLinkTested] = useState(false);
  const [whatsAppTested, setWhatsAppTested] = useState(false);
  const [preparedCount, setPreparedCount] = useState(0);
  const [validPreparedCount, setValidPreparedCount] = useState(0);

  useEffect(() => {
    queueMicrotask(()=>setSmsLinkTested(localStorage.getItem("attendance-sms-link-tested")==="yes"));
    queueMicrotask(()=>setWhatsAppTested(localStorage.getItem("attendance-wa-link-tested")==="yes"));
    void fetch("/api/messages/prepared").then(r=>r.json()).then(d=>{setPreparedCount((d.messages||[]).filter((m:{status:string})=>m.status==="READY").length);setValidPreparedCount((d.messages||[]).filter((m:{status:string;toNumber:string|null})=>m.status==="READY"&&!!m.toNumber).length)}).catch(()=>{});
    let active = true;
    void fetch("/api/settings/gateway")
      .then((response) => response.json())
      .then((value: Gateway) => {
        if (!active) return;
        setGateway(value);
        setMode(value.mode || "LOCAL");
        setBaseUrl(value.baseUrl || "http://192.168.1.50:8080");
        setSenderNumber(value.senderNumber || "");
        setTestPhone(value.senderNumber || "");
      })
      .catch(() => {
        if (active) setNotice("Could not load phone settings. Please refresh and try again.");
      });

    if (role === "HOD") {
      void fetch("/api/settings")
        .then((response) => response.json())
        .then((value: CollegeSettings) => {
          if (active) setCollege(value);
        })
        .catch(() => {
          if (active) setNotice("Could not load portal messaging settings.");
        });
    }

    return () => {
      active = false;
    };
  }, [role]);

  async function save() {
    const response = await fetch("/api/settings/gateway", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, baseUrl, username, password: password || undefined, senderNumber }),
    });
    const data = await response.json();
    setNotice(data.error ? JSON.stringify(data.error) : "Phone settings saved securely.");
    if (response.ok) {
      setGateway({ configured: true, mode, baseUrl, senderNumber });
      setPassword("");
    }
  }

  async function test() {
    const response = await fetch("/api/settings/gateway/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone }),
    });
    const data = await response.json();
    setNotice(data.error || "Connection succeeded. Test SMS sent to your number.");
    if (response.ok) {
      setGateway((current) => ({
        ...current,
        lastTestAt: new Date().toISOString(),
        lastSuccessfulTestAt: new Date().toISOString(),
        lastTestOk: true,
      }));
    }
  }

  async function saveMobile() {
    const response = await fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile }),
    });
    const data = await response.json();
    setNotice(data.error || "Sender contact number saved.");
  }

  async function saveCollege() {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(college),
    });
    const data = await response.json();
    setNotice(data.error ? JSON.stringify(data.error) : "Portal messaging settings saved.");
  }

  async function changePassword() {
    const response = await fetch("/api/settings/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    setNotice(data.error || "Password changed successfully.");
    if (response.ok) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  const smsAscii = Array.from(college.smsTemplate).every((character) => character.charCodeAt(0) <= 127);
  const smsParts = college.smsTemplate.length <= 160 ? 1 : Math.ceil(college.smsTemplate.length / 153);
  const statusOkay = notice.includes("saved") || notice.includes("succeeded") || notice.includes("successfully");

  return (
    <main className="settings-page">
      <PageHeader className="settings-heading" eyebrow={`ACCOUNT SETTINGS · ${role}`} title="Your phone & messaging" subtitle={<>Messages use the sender settings configured for <b>{name}</b>.</>} actions={<div className="settings-heading-icon" aria-hidden="true"><ShieldCheck size={22} /></div>} />

      {notice && <div role="status" className={`settings-notice ${statusOkay ? "notice-success" : "notice-info"}`}>{statusOkay ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

      <section className="settings-card" aria-labelledby="sender-contact-title">
        <div className="settings-card-heading"><span className="settings-card-icon"><UserRound size={18} /></span><div><h2 id="sender-contact-title">Your sender contact</h2><p>This number appears in messages so parents can reach you.</p></div></div>
        <div className="settings-contact-row"><label className="settings-field"><span>Your mobile number</span><input inputMode="tel" autoComplete="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="10-digit mobile number" /></label><button className="settings-primary-button" onClick={() => void saveMobile()}><Save size={16} />Save number</button></div>
      </section>

      {role === "HOD" && (
        <section className="settings-card" aria-labelledby="portal-settings-title">
          <div className="settings-card-heading"><span className="settings-card-icon blue-icon"><MessageSquareText size={18} /></span><div><h2 id="portal-settings-title">Portal messaging</h2><p>Set the college details, test destination, and parent message templates.</p></div></div>
          <div className="settings-form-grid portal-form-grid">
            <label className="settings-field"><span>College name</span><input value={college.collegeName} onChange={(event) => setCollege({ ...college, collegeName: event.target.value })} /></label>
            <label className="settings-field"><span>Department</span><input value={college.department} onChange={(event) => setCollege({ ...college, department: event.target.value })} /></label>
            <label className="settings-field"><span>Test phone number</span><input inputMode="tel" value={college.testNumber} onChange={(event) => setCollege({ ...college, testNumber: event.target.value })} /></label>
            <label className="settings-toggle"><input type="checkbox" checked={college.testMode} onChange={(event) => setCollege({ ...college, testMode: event.target.checked })} /><span><b>Test mode</b><small>All messages go to the test phone number above.</small></span></label>
          </div>
          <div className="settings-template-grid">
            <label className="settings-field"><span>SMS template</span><textarea rows={6} value={college.smsTemplate} onChange={(event) => setCollege({ ...college, smsTemplate: event.target.value })} /><small className={`template-counter ${college.smsTemplate.length > 306 || !smsAscii ? "counter-warning" : ""}`}>{college.smsTemplate.length}/306 characters · {smsParts} SMS part{smsParts === 1 ? "" : "s"} · up to 2 parts · {smsAscii ? "ASCII" : "Use ASCII characters only"}</small></label>
            <label className="settings-field"><span>WhatsApp template</span><textarea rows={8} value={college.whatsappTemplate} onChange={(event) => setCollege({ ...college, whatsappTemplate: event.target.value })} /><small className="template-help">Available placeholders: <code>{"{student_name}"}</code>, <code>{"{reg_no}"}</code>, <code>{"{section}"}</code>, <code>{"{avg}"}</code>, <code>{"{subjects}"}</code>, <code>{"{sender_name}"}</code>, <code>{"{sender_mobile}"}</code>.</small></label>
          </div>
          <div className="settings-card-actions"><button className="settings-primary-button" onClick={() => void saveCollege()}><Save size={16} />Save messaging settings</button></div>
        </section>
      )}

      <section className="settings-card" aria-labelledby="demo-checklist-title">
        <div className="settings-card-heading"><span className="settings-card-icon"><CheckCircle2 size={18} /></span><div><h2 id="demo-checklist-title">Demo checklist</h2><p>Verify your browser and a test message before a live workflow.</p></div></div>
        <div className="settings-card-actions"><button className="settings-secondary-button" onClick={()=>{try{const phone=normalizeIndianMobile(testPhone||mobile);window.open(buildSmsUrl(phone,"Smart Attendance SMS link test"),"attendance_sms_test");const ok=window.confirm("Did a messaging app open with the number and text filled in?");setSmsLinkTested(ok);localStorage.setItem("attendance-sms-link-tested",ok?"yes":"no");localStorage.setItem("attendance-sms-mode",ok?"sms-link":"google-messages")}catch{setNotice("Enter a valid test phone number first.")}}}>Test my computer&apos;s SMS link</button><button className="settings-secondary-button" onClick={()=>{try{const phone=normalizeIndianMobile(testPhone||mobile);window.open(buildWhatsAppUrl(phone,"Smart Attendance WhatsApp link test","desktop"),"wa_sender","popup,width=1000,height=750");const ok=window.confirm("Did WhatsApp Web open with the number and test text?");setWhatsAppTested(ok);localStorage.setItem("attendance-wa-link-tested",ok?"yes":"no")}catch{setNotice("Enter a valid test phone number first.")}}}>Test WhatsApp Web link</button></div>
        <ul className="settings-checklist"><li>{college.testMode?"✓ Test mode is on":"✓ Test mode is off"}</li><li>{whatsAppTested?"✓ WhatsApp Web link tested":"○ WhatsApp Web link not tested"}</li><li>{smsLinkTested?"✓ SMS link tested":"○ SMS link not tested"}</li><li>{validPreparedCount?"✓ Detained student has a valid parent number":"○ No valid detained-student number"}</li><li>{preparedCount?"✓ Messages prepared":"○ No prepared messages yet"}</li></ul>
      </section>
      <details className="settings-card settings-phone-card settings-advanced"><summary>Advanced · Android SMS Gateway (optional)</summary><p>This optional integration is not required for the Send Center, which uses your own browser/device messaging apps.</p><section id="phone-setup" aria-labelledby="phone-setup-title">
        <div className="settings-card-heading"><span className="settings-card-icon phone-icon"><Smartphone size={18} /></span><div><h2 id="phone-setup-title">Set up your SMS phone</h2><p>Connect the phone that will send messages from your account.</p></div></div>
        <div className="gateway-status-panel">
          <span className={`gateway-status-dot ${gateway.configured ? "is-configured" : ""}`} />
          <div><b>{gateway.configured ? "Phone configured" : "Phone not configured"}</b><small>{gateway.configured ? `${mode === "LOCAL" ? "Local" : "Cloud"} gateway${senderNumber ? ` · ${senderNumber}` : ""}` : "Complete the setup steps below before sending SMS."}</small></div>
          {gateway.lastSuccessfulTestAt && <span className="gateway-last-test">Last successful test · {new Date(gateway.lastSuccessfulTestAt).toLocaleString()}</span>}
        </div>
        <ol className="phone-setup-steps">
          <li><span>1</span><div><b>Install the Android gateway app</b><small><a href="https://github.com/capcom6/android-sms-gateway" target="_blank" rel="noreferrer">SMS Gateway for Android</a> must be installed on the phone that sends messages.</small></div></li>
          <li><span>2</span><div><b>Choose a connection mode</b><small>Enable Local Server when the phone and app share WiFi, or enable Cloud Server in the Android app.</small></div></li>
          <li><span>3</span><div><b>Enter your phone details</b><small>For Local mode, use the phone IP and port 8080. Enter the app username and password.</small></div></li>
          <li><span>4</span><div><b>Save and test the connection</b><small>Send a test SMS to your own number before messaging parents.</small></div></li>
        </ol>
        <div className="settings-form-grid gateway-form-grid">
          <label className="settings-field"><span>Connection mode</span><select value={mode} onChange={(event) => setMode(event.target.value as "LOCAL" | "CLOUD")}><option value="LOCAL">Local · same WiFi</option><option value="CLOUD">Cloud · app cloud service</option></select></label>
          <label className="settings-field"><span>{mode === "LOCAL" ? "Phone base URL" : "Cloud endpoint (fixed)"}</span><input disabled={mode === "CLOUD"} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://192.168.1.50:8080" /></label>
          <label className="settings-field"><span>Gateway username</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={gateway.configured ? "Saved (leave blank to keep)" : "Enter username"} /></label>
          <label className="settings-field"><span>Gateway password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={gateway.configured ? "Saved (leave blank to keep)" : "Enter password"} /></label>
          <label className="settings-field"><span>Sender phone number</span><input inputMode="tel" value={senderNumber} onChange={(event) => setSenderNumber(event.target.value)} placeholder="+91…" /></label>
          <label className="settings-field"><span>Send test SMS to</span><input inputMode="tel" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="Your own number" /></label>
        </div>
        <div className="settings-card-actions"><button className="settings-primary-button" onClick={() => void save()}><Save size={16} />Save phone settings</button><button className="settings-secondary-button" onClick={() => void test()} disabled={!gateway.configured && !password}><CheckCircle2 size={16} />Test connection</button></div>
        <aside className="settings-troubleshooting"><b>Troubleshooting</b><ul><li>For Local mode, keep the phone and server on the same WiFi.</li><li>College WiFi client isolation can block devices from reaching each other.</li><li>Turn off battery optimization for the gateway app and keep the phone online.</li><li>Check that Local Server or Cloud Server is enabled in the app.</li></ul></aside>
        <p className="settings-security-note"><ShieldCheck size={15} />Gateway passwords are encrypted by the server and are never shown here again or exposed to the HOD. Confirm app endpoint details against its current documentation before live use.</p>
      </section>

      </details>
      <section className="settings-card" aria-labelledby="password-title">
        <div className="settings-card-heading"><span className="settings-card-icon lock-icon"><KeyRound size={18} /></span><div><h2 id="password-title">Change your password</h2><p>Use a strong password with at least 12 characters.</p></div></div>
        <div className="settings-password-row"><label className="settings-field"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label className="settings-field"><span>New password</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="12+ characters" /></label><button className="settings-primary-button" onClick={() => void changePassword()}><KeyRound size={16} />Update password</button></div>
      </section>
    </main>
  );
}
