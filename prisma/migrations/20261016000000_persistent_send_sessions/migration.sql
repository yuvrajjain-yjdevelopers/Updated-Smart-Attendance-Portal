CREATE TYPE "ConnectionKind" AS ENUM ('WHATSAPP_WEB', 'MOBILE_LINK');
CREATE TYPE "MobileLinkMode" AS ENUM ('SMS_LINK', 'GOOGLE_MESSAGES', 'PHONE');
CREATE TYPE "SendSessionStatus" AS ENUM ('PREPARED', 'IN_PROGRESS', 'PAUSED_SETUP', 'COMPLETED', 'CANCELLED');
CREATE TYPE "SendSessionItemStatus" AS ENUM ('PENDING', 'OPENED', 'SENT_BY_USER', 'SKIPPED', 'FAILED', 'EXCLUDED');

ALTER TABLE "PreparedMessage" ADD COLUMN "sourceFingerprint" TEXT;
ALTER TABLE "User" ADD COLUMN "mobileLinkMode" "MobileLinkMode" NOT NULL DEFAULT 'SMS_LINK';

CREATE TABLE "MessagingConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "ConnectionKind" NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessagingConnection_userId_kind_key" ON "MessagingConnection"("userId", "kind");
ALTER TABLE "MessagingConnection" ADD CONSTRAINT "MessagingConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SendSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "mobileLinkMode" "MobileLinkMode" NOT NULL DEFAULT 'SMS_LINK',
  "sectionId" TEXT NOT NULL,
  "activeKey" TEXT,
  "status" "SendSessionStatus" NOT NULL DEFAULT 'PREPARED',
  "currentIndex" INTEGER NOT NULL DEFAULT 0,
  "testMode" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SendSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SendSession_userId_channel_status_idx" ON "SendSession"("userId", "channel", "status");
CREATE UNIQUE INDEX "SendSession_activeKey_key" ON "SendSession"("activeKey");
ALTER TABLE "SendSession" ADD CONSTRAINT "SendSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SendSession" ADD CONSTRAINT "SendSession_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SendSessionItem" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "preparedMessageId" TEXT,
  "messageLogId" TEXT,
  "status" "SendSessionItemStatus" NOT NULL DEFAULT 'PENDING',
  "order" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SendSessionItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SendSessionItem_messageLogId_key" ON "SendSessionItem"("messageLogId");
CREATE UNIQUE INDEX "SendSessionItem_sessionId_order_key" ON "SendSessionItem"("sessionId", "order");
CREATE INDEX "SendSessionItem_sessionId_status_idx" ON "SendSessionItem"("sessionId", "status");
ALTER TABLE "SendSessionItem" ADD CONSTRAINT "SendSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SendSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SendSessionItem" ADD CONSTRAINT "SendSessionItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SendSessionItem" ADD CONSTRAINT "SendSessionItem_preparedMessageId_fkey" FOREIGN KEY ("preparedMessageId") REFERENCES "PreparedMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SendSessionItem" ADD CONSTRAINT "SendSessionItem_messageLogId_fkey" FOREIGN KEY ("messageLogId") REFERENCES "MessageLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
