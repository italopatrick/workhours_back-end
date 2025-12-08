-- Add timeclock_edited to AuditAction enum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'timeclock_edited';

