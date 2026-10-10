import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import ClassMessaging from "@/app/components/class-messaging";
import { DEFAULT_ATTENDANCE_THRESHOLD, attendanceSourceLabel, getEffectiveAttendance, getStatus } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export default async function MyClass() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "TEACHER") redirect("/dashboard");

  const students = await db.student.findMany({
    where: { sectionId: user.sectionId ?? "" },
    orderBy: { avgAtt: "asc" },
  });
  const followupStudents = students.map(student => { const attendance=getEffectiveAttendance(student);return{...student,avgAtt:attendance.pct,isDetained:getStatus(student,DEFAULT_ATTENDANCE_THRESHOLD)==="Detained",statusLabel:getStatus(student,DEFAULT_ATTENDANCE_THRESHOLD),attendanceSourceLabel:attendanceSourceLabel(attendance)}; }).filter(student=>student.statusLabel==="Detained"||student.statusLabel==="Below 75% (roster)");

  return (
    <main className="teacher-class-page">
      <header className="teacher-class-heading">
        <div><p className="eyebrow">TEACHER WORKSPACE</p><h1>{user.section?.name ?? "My class"}</h1><p>Review students below the attendance threshold and contact their parents from this section.</p></div>
        <div className="teacher-class-count"><b>{followupStudents.length}</b><span>students need follow-up</span></div>
      </header>
      <section className="teacher-class-messaging">
        <div className="teacher-class-subheading"><h2>Parent messages</h2><p>Recipients are limited to students in your assigned section.</p></div>
        <ClassMessaging students={followupStudents.map(student=>({id:student.id,name:student.name,regNo:student.regNo,parentMobile:student.parentMobile,avgAtt:student.avgAtt,isDetained:student.isDetained,statusLabel:student.statusLabel,attendanceSourceLabel:student.attendanceSourceLabel}))} senderName={user.name} canSend={user.canSend} />
      </section>
    </main>
  );
}
