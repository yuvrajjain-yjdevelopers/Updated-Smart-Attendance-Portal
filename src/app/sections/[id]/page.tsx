import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import ClassMessaging from "@/app/components/class-messaging";
import DetentionUploader from "@/app/components/detention-uploader";
import SectionStudents from "@/app/components/section-students";
import SectionTabs from "@/app/components/section-tabs";
import UnfinishedSendBanner from "@/app/components/unfinished-send-banner";
import { DEFAULT_ATTENDANCE_THRESHOLD, attendanceSourceLabel, getEffectiveAttendance, getStatus } from "@/lib/attendance";
import { parseDetainedSubjects } from "@/lib/detentionSubjects";

export const dynamic = "force-dynamic";

export default async function SectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ resumeSession?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "HOD") redirect("/my-class");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [section, settings] = await Promise.all([
    db.section.findUnique({
      where: { id },
      select: { id: true, name: true, uploads: { orderBy: { uptoDate: "desc" }, take: 1, select: { uptoDate: true } } },
    }),
    db.setting.findMany({ where: { key: { in: ["attendanceThreshold", "threshold"] } }, select: { key: true, value: true } }),
  ]);
  if (!section) notFound();
  const settingValues = Object.fromEntries(settings.map(setting => [setting.key, setting.value]));
  const threshold = Number(settingValues.attendanceThreshold || settingValues.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  const belowThresholdStudents = await db.student.findMany({
    where: {
      sectionId: id,
      OR: [
        { avgAtt: { lt: threshold }, lastListDate: { not: null } },
        { totalAttendancePct: { lt: threshold }, OR: [{ avgAtt: null }, { lastListDate: null }] },
      ],
    },
    select: { id: true, name: true, regNo: true, parentMobile: true, sectionId: true, avgAtt: true, totalAttendancePct: true, lastListDate: true, isDetained: true, lowSubjectCount: true, detainedSubjects: true },
  });
  const followupStudents = belowThresholdStudents.map(student => {
    const attendance = getEffectiveAttendance(student);
    const statusLabel = getStatus(student, threshold);
    return { ...student, avgAtt: attendance.pct, isDetained: statusLabel === "Detained", statusLabel, attendanceSourceLabel: attendanceSourceLabel(attendance), detainedSubjects: attendance.source === "LIST" ? parseDetainedSubjects(student.detainedSubjects) : [] };
  }).filter(student => student.statusLabel === "Detained");
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
      <UnfinishedSendBanner />
      <DetentionUploader sectionId={section.id} sectionName={section.name} allowAddUnmatched />
      <SectionTabs
        initialTab={query.resumeSession ? "messages" : "students"}
        students={<SectionStudents sectionId={section.id} />}
        messaging={
          <section className="section-detail-messaging">
            <div className="section-detail-subheading">
              <div><span className="eyebrow">PARENT FOLLOW-UP</span><h2>Students below threshold · {followupStudents.length}</h2><p>Ready to send: {readyToSend}</p></div>
              <p>Review the list and recipients before sending a message.</p>
            </div>
            <ClassMessaging sectionId={section.id} mobileLinkMode={user.mobileLinkMode} students={followupStudents.map(student => ({ id: student.id, name: student.name, regNo: student.regNo, parentMobile: student.parentMobile, avgAtt: student.avgAtt, isDetained: student.isDetained, statusLabel: student.statusLabel, attendanceSourceLabel: student.attendanceSourceLabel }))} senderName={user.name} senderMobile={user.mobile || ""} canSend isHod />
          </section>
        }
      />
    </main>
  );
}
