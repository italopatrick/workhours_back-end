-- CreateTable
-- Criar tabela work_schedules para jornada de trabalho normalizada
CREATE TABLE IF NOT EXISTS "work_schedules" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "work_schedules_employeeId_dayOfWeek_key" ON "work_schedules"("employeeId", "dayOfWeek");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_schedules_employeeId_idx" ON "work_schedules"("employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_schedules_dayOfWeek_idx" ON "work_schedules"("dayOfWeek");

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

