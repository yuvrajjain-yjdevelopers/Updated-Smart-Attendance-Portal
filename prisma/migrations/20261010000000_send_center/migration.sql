ALTER TYPE "MessageStatus" ADD VALUE IF NOT EXISTS 'SENT_BY_USER';
CREATE TYPE "PreparedStatus" AS ENUM ('READY', 'MISSING_NUMBER', 'SENT', 'OPENED', 'SKIPPED');
ALTER TABLE "MessageLog" ADD COLUMN "mode" TEXT;
CREATE TABLE "PreparedMessage" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "status" "PreparedStatus" NOT NULL DEFAULT 'READY',
  "toNumber" TEXT,
  "text" TEXT NOT NULL,
  "listDate" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreparedMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PreparedMessage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PreparedMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PreparedMessage_studentId_senderId_channel_key" ON "PreparedMessage"("studentId", "senderId", "channel");
CREATE INDEX "PreparedMessage_senderId_status_idx" ON "PreparedMessage"("senderId", "status");

UPDATE "Setting"
SET "value" = $new$Dear Parent, {student_name} (Reg {reg_no}) has {avg}% attendance, below 75%, as of {date}. Detained in {detained_count} subjects. Please contact {sender_name} ({sender_mobile}). -{college_name}$new$
WHERE "key" = 'smsTemplate'
  AND "value" = $old$Attendance alert: {student_name} ({reg_no}) {avg}%. Subjects: {subjects_short}. Contact {sender_name} ({sender_mobile}).$old$;

UPDATE "Setting"
SET "value" = $new$Dear Parent,

Name: {student_name}
Reg No: {reg_no}
Section: {section}
Overall Attendance: {avg}%
Detained subjects:
{subjects}

The minimum required attendance is 75%. Please contact {sender_name} ({sender_mobile}).

Regards,
{sender_name}, {department}
{college_name}$new$
WHERE "key" = 'whatsappTemplate'
  AND "value" = $old$Dear Parent,

This is to inform you that your ward has low attendance.

Name: {student_name}
Reg No: {reg_no}
Section: {section}
Overall Attendance: {avg}%

Detained subjects:
{subjects}

The minimum required attendance is 75%. Please contact {sender_name} ({sender_mobile}) for any queries.

Regards,
{sender_name}, {department}
{college_name}$old$;
