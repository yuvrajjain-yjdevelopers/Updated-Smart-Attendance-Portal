ALTER TABLE "User" ADD COLUMN "canMarkDailyAttendance" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PreparedMessage" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DETENTION';
ALTER TABLE "MessageLog" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DETENTION';
ALTER TABLE "SendSession" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DETENTION';
ALTER TABLE "SendSessionItem" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DETENTION';
DROP INDEX "PreparedMessage_studentId_senderId_channel_key";
CREATE UNIQUE INDEX "PreparedMessage_studentId_senderId_channel_kind_key" ON "PreparedMessage"("studentId", "senderId", "channel", "kind");

CREATE TABLE "DailyAttendance" (
  "id" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "markedById" TEXT,
  "markedByName" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "isHoliday" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "DailyAttendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyAttendance_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DailyAttendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DailyAttendance_sectionId_date_key" ON "DailyAttendance"("sectionId", "date");
CREATE INDEX "DailyAttendance_date_sectionId_idx" ON "DailyAttendance"("date", "sectionId");

CREATE TABLE "DailyAttendanceEntry" (
  "id" TEXT NOT NULL,
  "dailyAttendanceId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyAttendanceEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyAttendanceEntry_dailyAttendanceId_fkey" FOREIGN KEY ("dailyAttendanceId") REFERENCES "DailyAttendance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DailyAttendanceEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DailyAttendanceEntry_dailyAttendanceId_studentId_key" ON "DailyAttendanceEntry"("dailyAttendanceId", "studentId");
CREATE INDEX "DailyAttendanceEntry_studentId_dailyAttendanceId_idx" ON "DailyAttendanceEntry"("studentId", "dailyAttendanceId");

CREATE TABLE "DailyAttendanceAudit" (
  "id" TEXT NOT NULL,
  "dailyAttendanceId" TEXT NOT NULL,
  "changedById" TEXT,
  "changedByName" TEXT NOT NULL,
  "studentId" TEXT,
  "field" TEXT NOT NULL,
  "fromValue" TEXT,
  "toValue" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyAttendanceAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DailyAttendanceAudit_dailyAttendanceId_fkey" FOREIGN KEY ("dailyAttendanceId") REFERENCES "DailyAttendance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DailyAttendanceAudit_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "DailyAttendanceAudit_dailyAttendanceId_changedAt_idx" ON "DailyAttendanceAudit"("dailyAttendanceId", "changedAt");
