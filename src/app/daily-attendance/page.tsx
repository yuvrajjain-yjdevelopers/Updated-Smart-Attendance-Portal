import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import DailyAttendanceClient from "@/features/daily-attendance/daily-attendance-client";

export const dynamic = "force-dynamic";
export default async function DailyAttendancePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <DailyAttendanceClient role={user.role} teacherSectionId={user.sectionId} canMark={user.role === "HOD" || user.canMarkDailyAttendance} canSend={user.role === "HOD" || user.canSend} senderName={user.name} senderMobile={user.mobile || ""} mobileLinkMode={user.mobileLinkMode} />;
}
