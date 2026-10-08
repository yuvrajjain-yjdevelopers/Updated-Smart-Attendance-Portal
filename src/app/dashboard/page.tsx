import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight,GraduationCap,Layers3,MessageSquareText,UserRoundCheck } from "lucide-react";
export const dynamic="force-dynamic";
export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "HOD") redirect("/my-class");

  const [students, detained, sections, messages] = await Promise.all([
    db.student.count(),
    db.student.count({ where: { isDetained: true } }),
    db.section.count(),
    db.messageLog.count({ where: { status: "SENT", createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
  ]);
  const stats = [
    { label: "Total students", value: students, icon: GraduationCap, accent: "teal", foot: "Across all sections" },
    { label: "Need follow-up", value: detained, icon: UserRoundCheck, accent: "rose", foot: "Attendance below threshold" },
    { label: "Sections", value: sections, icon: Layers3, accent: "blue", foot: "Active class groups" },
    { label: "Messages today", value: messages, icon: MessageSquareText, accent: "amber", foot: "Successfully sent" },
  ];

  return (
    <main className="dashboard-page">
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow">DEPARTMENT OVERVIEW</p>
          <h1>Good day, {user.name.split(" ")[0]} <span>✦</span></h1>
          <p>Here’s the latest picture of attendance follow-up across your sections.</p>
        </div>
        <Link href="/sections" className="dashboard-action">View sections <ArrowUpRight size={16} /></Link>
      </section>
      <section className="metric-grid">
        {stats.map(({ label, value, icon: Icon, accent, foot }) => (
          <article className={`metric-card ${accent}`} key={label}>
            <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={18} /></span></div>
            <b className="metric-value">{value}</b>
            <small>{foot}</small>
          </article>
        ))}
      </section>
      <section className="dashboard-lower">
        <article className="welcome-card">
          <div className="welcome-card-icon"><GraduationCap size={22} /></div>
          <p className="eyebrow">GET STARTED</p>
          <h2>Build your student directory</h2>
          <p>Upload the HOD’s student master sheet, check each section’s contact details, then review the latest attendance list.</p>
          <div className="welcome-actions">
            <Link href="/students">Upload student details <ArrowUpRight size={15} /></Link>
            <Link href="/settings#phone-setup">Set up sender phone</Link>
          </div>
        </article>
        <article className="workflow-card">
          <p className="eyebrow">A SIMPLE WORKFLOW</p>
          <h2>Attendance follow-up</h2>
          <ol>
            <li><span>01</span><div><b>Keep student details current</b><small>Organize contacts by section.</small></div></li>
            <li><span>02</span><div><b>Preview the detention list</b><small>Check unmatched students before applying.</small></div></li>
            <li><span>03</span><div><b>Message parents</b><small>Review recipients before each send.</small></div></li>
          </ol>
        </article>
      </section>
    </main>
  );
}
