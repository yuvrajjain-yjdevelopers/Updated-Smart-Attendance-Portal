-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('HOD', 'TEACHER');

-- CreateEnum
CREATE TYPE "SmsGatewayMode" AS ENUM ('LOCAL', 'CLOUD');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'OPENED', 'SKIPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TEACHER',
    "sectionId" TEXT,
    "canSend" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mobile" TEXT,
    "smsGatewayMode" "SmsGatewayMode",
    "smsGatewayUrl" TEXT,
    "smsGatewayUser" TEXT,
    "smsGatewayPassEnc" TEXT,
    "smsGatewaySenderNumber" TEXT,
    "smsGatewayLastTestAt" TIMESTAMP(3),
    "smsGatewayLastSuccessfulTestAt" TIMESTAMP(3),
    "smsGatewayLastTestOk" BOOLEAN,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "regNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "parentMobile" TEXT NOT NULL,
    "studentMobile" TEXT,
    "branch" TEXT,
    "totalAttendancePct" DOUBLE PRECISION,
    "avgAtt" DOUBLE PRECISION,
    "isDetained" BOOLEAN NOT NULL DEFAULT false,
    "detainedSubjects" TEXT NOT NULL DEFAULT '[]',
    "lowSubjectCount" INTEGER NOT NULL DEFAULT 0,
    "lastListDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetentionUpload" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uptoDate" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "parsedCount" INTEGER NOT NULL,
    "matchedCount" INTEGER NOT NULL,
    "detainedCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetentionUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetentionEntry" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "avgAtt" DOUBLE PRECISION NOT NULL,
    "detainedSubjects" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "DetentionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageBatch" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "channels" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "listDate" TIMESTAMP(3),
    "toNumber" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Section_name_key" ON "Section"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Student_regNo_key" ON "Student"("regNo");

-- CreateIndex
CREATE UNIQUE INDEX "DetentionUpload_sectionId_uptoDate_key" ON "DetentionUpload"("sectionId", "uptoDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetentionUpload" ADD CONSTRAINT "DetentionUpload_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetentionEntry" ADD CONSTRAINT "DetentionEntry_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "DetentionUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetentionEntry" ADD CONSTRAINT "DetentionEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageBatch" ADD CONSTRAINT "MessageBatch_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageBatch" ADD CONSTRAINT "MessageBatch_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MessageBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
