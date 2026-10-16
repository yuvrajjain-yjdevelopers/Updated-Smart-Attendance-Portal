CREATE INDEX "Student_sectionId_regNo_idx" ON "Student"("sectionId", "regNo");
CREATE INDEX "Student_sectionId_avgAtt_lastListDate_idx" ON "Student"("sectionId", "avgAtt", "lastListDate");
CREATE INDEX "Student_sectionId_totalAttendancePct_idx" ON "Student"("sectionId", "totalAttendancePct");
