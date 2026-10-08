import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
async function main() {
  const sections = [];
  for (const name of ["A", "B", "C"]) sections.push(await db.section.upsert({ where: { name }, update: {}, create: { name } }));
  const hodPass = process.env.HOD_PASSWORD || "Hod@12345";
  await db.user.upsert({ where: { username: "hod" }, update: {}, create: { username: "hod", name: "Head of Department", role: "HOD", passwordHash: await bcrypt.hash(hodPass, 12) } });
  for (const [index, section] of sections.entries()) {
    const username = `teacher${section.name}`;
    await db.user.upsert({ where: { username }, update: {}, create: { username, name: `Class Teacher ${section.name}`, role: "TEACHER", sectionId: section.id, passwordHash: await bcrypt.hash(`Teacher@${section.name}123`, 12) } });
    for (let i = 1; i <= 12; i++) {
      const regNo = `DEMO${section.name}${String(i).padStart(3,"0")}`;
      await db.student.upsert({ where: { regNo }, update: {}, create: { regNo, name: `Sample Student ${section.name}-${i}`, sectionId: section.id, parentMobile: `910000${String(index * 12 + i).padStart(4,"0")}`, avgAtt: i <= 5 ? 60 + i : 75 + i, isDetained: i <= 5, detainedSubjects: i <= 5 ? '[{"code":"SUB101","name":"Sample Subject"}]' : "[]" } });
    }
  }
  for (const [key, value] of Object.entries({ testMode: "true", testNumber: "9000000001", collegeName: "Your College", department: "Department", threshold: "75", smsTemplate: "Attendance alert: {student_name} ({reg_no}) {avg}%. Subjects: {subjects_short}. Contact {sender_name} ({sender_mobile}).", whatsappTemplate: "Dear Parent,\n\nThis is to inform you that your ward has low attendance.\n\nName: {student_name}\nReg No: {reg_no}\nSection: {section}\nOverall Attendance: {avg}%\n\nDetained subjects:\n{subjects}\n\nThe minimum required attendance is 75%. Please contact {sender_name} ({sender_mobile}) for any queries.\n\nRegards,\n{sender_name}, {department}\n{college_name}" })) await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  console.log(`Seeded HOD (hod / ${hodPass}), teachers (teacherA / Teacher@A123, teacherB / Teacher@B123, teacherC / Teacher@C123) and sample data.`);
}
main().finally(() => db.$disconnect());
