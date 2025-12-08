-- CreateTable
CREATE TABLE IF NOT EXISTS "time_clock_justifications" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_clock_justifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "time_clock_justifications_reason_key" ON "time_clock_justifications"("reason");

-- AlterTable
ALTER TABLE "time_clocks" ADD COLUMN IF NOT EXISTS "justificationId" TEXT;

-- AddForeignKey
ALTER TABLE "time_clocks" ADD CONSTRAINT "time_clocks_justificationId_fkey" FOREIGN KEY ("justificationId") REFERENCES "time_clock_justifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

