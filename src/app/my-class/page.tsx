import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import ClassMessaging from "@/app/components/class-messaging";
import SectionStudents from "@/app/components/section-students";
import DetentionUploader from "@/app/components/detention-uploader";
import UnfinishedSendBanner from "@/app/components/unfinished-send-banner";
import { DEFAULT_ATTENDANCE_THRESHOLD, attendanceSourceLabel, getEffectiveAttendance, getStatus } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export default async function MyClass() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "TEACHER") redirect("/dashboard");

  const sectionId = user.sectionId;
  const settings = await db.setting.findMany({
    where: { key: { in: ["attendanceThreshold", "threshold"] } },
    select: { key: true, value: true },
  });
  const settingValues = Object.fromEntries(settings.map(setting => [setting.key, setting.value]));
  const threshold = Number(settingValues.attendanceThreshold || settingValues.threshold || DEFAULT_ATTENDANCE_THRESHOLD);
  const belowThreshold = sectionId ? await db.student.findMany({
    where: {
      sectionId,
      OR: [
        { avgAtt: { lt: threshold }, lastListDate: { not: null } },
        { totalAttendancePct: { lt: threshold }, OR: [{ avgAtt: null }, { lastListDate: null }] },
      ],
    },
    select: { id: true, name: true, regNo: true, parentMobile: true, avgAtt: true, totalAttendancePct: true, lastListDate: true, isDetained: true, lowSubjectCount: true },
  }) : [];
  const followupStudents = belowThreshold
    .map(student => {
      const attendance = getEffectiveAttendance(student);
      const statusLabel = getStatus(student, threshold);
      return {
        id: student.id,
        name: student.name,
        regNo: student.regNo,
        parentMobile: student.parentMobile,
        avgAtt: attendance.pct,
        isDetained: statusLabel === "Detained",
        statusLabel,
        attendanceSourceLabel: attendanceSourceLabel(attendance),
      };
    })
    .filter(student => student.statusLabel === "Detained")
    .sort((a, b) => (a.avgAtt ?? 101) - (b.avgAtt ?? 101));

  return (
    <main className="teacher-class-page">
      <header className="teacher-class-heading">
        <div><p className="eyebrow">TEACHER WORKSPACE</p><h1>{user.section?.name ?? "My class"}</h1><p>View and update your full student roster, then filter students who need attendance follow-up to contact their parents.</p></div>
        <div className="teacher-class-count"><b>{followupStudents.length}</b><span>students need follow-up</span></div>
      </header>
      <UnfinishedSendBanner />
      {sectionId ? <><DetentionUploader sectionId={sectionId} sectionName={user.section?.name || "your section"} /><SectionStudents sectionId={sectionId} mode="teacher" /></> : <section className="teacher-class-messaging"><p>Your account is not assigned to a section yet. Ask the HOD to assign your class.</p></section>}
      <section className="teacher-class-messaging">
        <div className="teacher-class-subheading"><h2>Parent messages</h2><p>Only students in your assigned section who are below the attendance threshold appear here. Sending also requires HOD permission for your account.</p></div>
        <ClassMessaging sectionId={sectionId || ""} mobileLinkMode={user.mobileLinkMode} students={followupStudents} senderName={user.name} senderMobile={user.mobile || ""} canSend={user.canSend} />
      </section>
    </main>
  );
}
