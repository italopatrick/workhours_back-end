-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'employee');

-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "HourBankType" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "HourBankStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('overtime_created', 'overtime_approved', 'overtime_rejected', 'overtime_updated', 'hourbank_credit_created', 'hourbank_debit_created', 'hourbank_approved', 'hourbank_rejected', 'employee_created', 'employee_deleted', 'employee_role_changed', 'employee_limit_changed', 'employee_exception_added', 'employee_exception_removed', 'settings_updated', 'settings_logo_updated');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('overtime', 'hourbank', 'employee', 'settings');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'employee',
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "externalId" TEXT,
    "externalAuth" BOOLEAN NOT NULL DEFAULT false,
    "overtimeLimit" DOUBLE PRECISION,
    "overtimeExceptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtimes" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'pending',
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "rejectedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hour_bank_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" "HourBankType" NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "overtimeRecordId" TEXT,
    "status" "HourBankStatus" NOT NULL DEFAULT 'pending',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "rejectedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hour_bank_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "logo" BYTEA,
    "logoContentType" TEXT,
    "reportHeader" TEXT NOT NULL DEFAULT '',
    "reportFooter" TEXT NOT NULL DEFAULT '',
    "managerEmail" TEXT,
    "defaultOvertimeLimit" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "defaultAccumulationLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultUsageLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_externalId_key" ON "users"("externalId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_externalId_idx" ON "users"("externalId");

-- CreateIndex
CREATE INDEX "overtimes_employeeId_idx" ON "overtimes"("employeeId");

-- CreateIndex
CREATE INDEX "overtimes_date_idx" ON "overtimes"("date");

-- CreateIndex
CREATE INDEX "overtimes_status_idx" ON "overtimes"("status");

-- CreateIndex
CREATE INDEX "overtimes_employeeId_date_idx" ON "overtimes"("employeeId", "date");

-- CreateIndex
CREATE INDEX "hour_bank_records_employeeId_idx" ON "hour_bank_records"("employeeId");

-- CreateIndex
CREATE INDEX "hour_bank_records_date_idx" ON "hour_bank_records"("date");

-- CreateIndex
CREATE INDEX "hour_bank_records_status_idx" ON "hour_bank_records"("status");

-- CreateIndex
CREATE INDEX "hour_bank_records_employeeId_date_idx" ON "hour_bank_records"("employeeId", "date");

-- CreateIndex
CREATE INDEX "hour_bank_records_employeeId_status_idx" ON "hour_bank_records"("employeeId", "status");

-- CreateIndex
CREATE INDEX "hour_bank_records_overtimeRecordId_idx" ON "hour_bank_records"("overtimeRecordId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");

-- CreateIndex
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_targetUserId_idx" ON "audit_logs"("targetUserId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "overtimes" ADD CONSTRAINT "overtimes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtimes" ADD CONSTRAINT "overtimes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtimes" ADD CONSTRAINT "overtimes_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtimes" ADD CONSTRAINT "overtimes_rejectedBy_fkey" FOREIGN KEY ("rejectedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_bank_records" ADD CONSTRAINT "hour_bank_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_bank_records" ADD CONSTRAINT "hour_bank_records_overtimeRecordId_fkey" FOREIGN KEY ("overtimeRecordId") REFERENCES "overtimes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_bank_records" ADD CONSTRAINT "hour_bank_records_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_bank_records" ADD CONSTRAINT "hour_bank_records_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_bank_records" ADD CONSTRAINT "hour_bank_records_rejectedBy_fkey" FOREIGN KEY ("rejectedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

