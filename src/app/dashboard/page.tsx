import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight,GraduationCap,Layers3,MessageSquareText,UserRoundCheck } from "lucide-react";
import { Button, Card, PageHeader, StatCard } from "@/app/components/ui";
import { DEFAULT_ATTENDANCE_THRESHOLD } from "@/lib/attendance";
import UnfinishedSendBanner from "@/app/components/unfinished-send-banner";
export const dynamic="force-dynamic";
export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "HOD") redirect("/my-class");

  const [students, detained, sections, messages, ready] = await Promise.all([
    db.student.count(),
    db.student.count({ where: { OR: [
      { avgAtt: { lt: DEFAULT_ATTENDANCE_THRESHOLD }, lastListDate: { not: null } },
      { totalAttendancePct: { lt: DEFAULT_ATTENDANCE_THRESHOLD }, OR: [{ avgAtt: null }, { lastListDate: null }] },
    ] } }),
    db.section.count(),
    db.messageLog.count({ where: { status: { in: ["SENT", "SENT_BY_USER"] }, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    db.preparedMessage.count({ where: { senderId: user.id, status: "READY" } }),
  ]);
  const stats = [
    { label: "Total students", value: students, icon: GraduationCap, accent: "teal", foot: "Across all sections" },
    { label: "Need follow-up", value: detained, icon: UserRoundCheck, accent: "rose", foot: "Attendance below threshold" },
    { label: "Sections", value: sections, icon: Layers3, accent: "blue", foot: "Active class groups" },
    { label: "Messages today", value: messages, icon: MessageSquareText, accent: "amber", foot: "Sender-confirmed sends" },
    { label: "Ready to send", value: ready, icon: MessageSquareText, accent: "teal", foot: "Prepared for your account" },
  ];

  return (
    <main className="dashboard-page">
      <PageHeader eyebrow="DEPARTMENT OVERVIEW" title={<>Good day, {user.name.split(" ")[0]} <span>✦</span></>} subtitle="Here’s the latest picture of attendance follow-up across your sections." actions={<Button href="/sections" variant="outline" className="dashboard-action">View sections <ArrowUpRight size={16} /></Button>} className="dashboard-welcome" />
      <UnfinishedSendBanner />
      <section className="metric-grid">
        {stats.map(({ label, value, icon: Icon, accent, foot }) => (
          <StatCard key={label} label={label} value={value} note={foot} icon={<Icon size={18} aria-hidden="true" />} accent={accent as "teal" | "rose" | "blue" | "amber"} />
        ))}
      </section>
      <section className="dashboard-lower">
        <Card className="welcome-card">
          <div className="welcome-card-icon"><GraduationCap size={22} /></div>
          <p className="eyebrow">GET STARTED</p>
          <h2>Build your student directory</h2>
          <p>Upload the HOD’s student master sheet, check each section’s contact details, then review the latest attendance list.</p>
          <div className="welcome-actions">
            <Link href="/students">Upload student details <ArrowUpRight size={15} /></Link>
            <Link href="/settings#phone-setup">Set up sender phone</Link>
          </div>
        </Card>
        <Card className="workflow-card">
          <p className="eyebrow">A SIMPLE WORKFLOW</p>
          <h2>Attendance follow-up</h2>
          <ol>
            <li><span>01</span><div><b>Keep student details current</b><small>Organize contacts by section.</small></div></li>
            <li><span>02</span><div><b>Preview the detention list</b><small>Check unmatched students before applying.</small></div></li>
            <li><span>03</span><div><b>Message parents</b><small>Review recipients before each send.</small></div></li>
          </ol>
        </Card>
      </section>
    </main>
  );
}
