-- AlterEnum
-- Adicionar novos valores ao enum AuditAction (se não existirem)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeclock_entry' AND enumtypid = 'AuditAction'::regtype) THEN
        ALTER TYPE "AuditAction" ADD VALUE 'timeclock_entry';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeclock_lunch_exit' AND enumtypid = 'AuditAction'::regtype) THEN
        ALTER TYPE "AuditAction" ADD VALUE 'timeclock_lunch_exit';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeclock_lunch_return' AND enumtypid = 'AuditAction'::regtype) THEN
        ALTER TYPE "AuditAction" ADD VALUE 'timeclock_lunch_return';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeclock_exit' AND enumtypid = 'AuditAction'::regtype) THEN
        ALTER TYPE "AuditAction" ADD VALUE 'timeclock_exit';
    END IF;
END $$;

-- AlterEnum
-- Adicionar novo valor ao enum EntityType (se não existir)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeclock' AND enumtypid = 'EntityType'::regtype) THEN
        ALTER TYPE "EntityType" ADD VALUE 'timeclock';
    END IF;
END $$;

-- AlterTable
-- Adicionar novos campos na tabela users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workSchedule" JSONB;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lunchBreakHours" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lateTolerance" INTEGER DEFAULT 10;

-- CreateTable
-- Criar tabela time_clocks
CREATE TABLE IF NOT EXISTS "time_clocks" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "entryTime" TIMESTAMP(3),
    "lunchExitTime" TIMESTAMP(3),
    "lunchReturnTime" TIMESTAMP(3),
    "exitTime" TIMESTAMP(3),
    "totalWorkedHours" DOUBLE PRECISION,
    "scheduledHours" DOUBLE PRECISION,
    "lateMinutes" INTEGER,
    "overtimeHours" DOUBLE PRECISION,
    "negativeHours" DOUBLE PRECISION,
    "hourBankCreditId" TEXT,
    "hourBankDebitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_clocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "time_clocks_employeeId_date_key" ON "time_clocks"("employeeId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "time_clocks_employeeId_idx" ON "time_clocks"("employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "time_clocks_date_idx" ON "time_clocks"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "time_clocks_employeeId_date_idx" ON "time_clocks"("employeeId", "date");

-- AddForeignKey
-- Adicionar foreign key para employeeId
ALTER TABLE "time_clocks" ADD CONSTRAINT "time_clocks_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Adicionar foreign key para hourBankCreditId (opcional)
ALTER TABLE "time_clocks" ADD CONSTRAINT "time_clocks_hourBankCreditId_fkey" FOREIGN KEY ("hourBankCreditId") REFERENCES "hour_bank_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- Adicionar foreign key para hourBankDebitId (opcional)
ALTER TABLE "time_clocks" ADD CONSTRAINT "time_clocks_hourBankDebitId_fkey" FOREIGN KEY ("hourBankDebitId") REFERENCES "hour_bank_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

