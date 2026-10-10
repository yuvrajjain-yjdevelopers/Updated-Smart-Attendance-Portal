import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ClassMessaging from "@/app/components/class-messaging";
import DetentionUploader from "@/app/components/detention-uploader";
import SectionStudents from "@/app/components/section-students";
import SectionTabs from "@/app/components/section-tabs";
import { ensurePreparedForSender } from "@/lib/preparedMessages";
import { DEFAULT_ATTENDANCE_THRESHOLD, attendanceSourceLabel, getEffectiveAttendance, getStatus } from "@/lib/attendance";
import { parseDetainedSubjects } from "@/lib/detentionSubjects";

export const dynamic = "force-dynamic";

export default async function SectionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "HOD") redirect("/my-class");

  const { id } = await params;
  await ensurePreparedForSender(user.id, id);
  const section = await db.section.findUnique({
    where: { id },
    include: {
      students: { orderBy: [{ avgAtt: "asc" }, { totalAttendancePct: "asc" }] },
      uploads: { orderBy: { uptoDate: "desc" }, take: 1 },
    },
  });
  if (!section) notFound();
  const followupStudents = section.students.map(student => {
    const attendance = getEffectiveAttendance(student);
    return { ...student, avgAtt: attendance.pct, isDetained: getStatus(student, DEFAULT_ATTENDANCE_THRESHOLD) === "Detained", statusLabel: getStatus(student, DEFAULT_ATTENDANCE_THRESHOLD), attendanceSourceLabel: attendanceSourceLabel(attendance), detainedSubjects: attendance.source === "LIST" ? parseDetainedSubjects(student.detainedSubjects) : [] };
  }).filter(student => student.statusLabel === "Detained" || student.statusLabel === "Below 75% (roster)");
  const readyToSend = await db.preparedMessage.count({ where: { senderId: user.id, student: { sectionId: id }, status: "READY" } });

  return (
    <main className="section-detail-page">
      <header className="section-detail-heading">
        <div>
          <Link href="/sections" className="section-back-link">← Back to sections</Link>
          <p className="eyebrow">SECTION WORKSPACE</p>
          <h1>Section {section.name}</h1>
          <p>Manage the student roster, attendance list, and parent follow-up for this section.</p>
        </div>
        <div className="section-detail-date">
          <span>ATTENDANCE DATA</span>
          <b>{section.uploads[0]?.uptoDate.toLocaleDateString("en-GB") ?? "No list applied"}</b>
        </div>
      </header>
      <DetentionUploader sectionId={section.id} sectionName={section.name} />
      <SectionTabs
        students={<SectionStudents sectionId={section.id} />}
        messaging={
          <section className="section-detail-messaging">
            <div className="section-detail-subheading">
              <div><span className="eyebrow">PARENT FOLLOW-UP</span><h2>Students below threshold · {followupStudents.length}</h2><p>Ready to send: {readyToSend}</p></div>
              <p>Review the list and recipients before sending a message.</p>
            </div>
            <ClassMessaging students={followupStudents.map(student => ({ id: student.id, name: student.name, regNo: student.regNo, parentMobile: student.parentMobile, avgAtt: student.avgAtt, isDetained: student.isDetained, statusLabel: student.statusLabel, attendanceSourceLabel: student.attendanceSourceLabel }))} senderName={user.name} canSend isHod />
          </section>
        }
      />
    </main>
  );
}
