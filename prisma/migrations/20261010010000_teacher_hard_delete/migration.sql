-- Keep message batches as audit history while allowing a teacher account to be permanently removed.
ALTER TABLE "MessageBatch" ALTER COLUMN "sentById" DROP NOT NULL;
ALTER TABLE "MessageBatch" DROP CONSTRAINT "MessageBatch_sentById_fkey";
ALTER TABLE "MessageBatch" ADD CONSTRAINT "MessageBatch_sentById_fkey"
  FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
