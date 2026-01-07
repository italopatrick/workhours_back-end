-- Add justification column to time_clocks table
ALTER TABLE "time_clocks" ADD COLUMN IF NOT EXISTS "justification" TEXT;
