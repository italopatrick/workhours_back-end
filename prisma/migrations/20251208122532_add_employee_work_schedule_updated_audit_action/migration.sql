-- Add employee_work_schedule_updated to AuditAction enum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'employee_work_schedule_updated';

