-- Migration: Add missing AuditAction enum values
-- Description: Adiciona valores faltantes ao enum AuditAction para suportar registros de ponto com justificativa
-- Date: 2025-01-20

-- Adicionar valores ao enum AuditAction se não existirem
DO $$
BEGIN
    -- Adicionar timeclock_entry_with_justification se não existir
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'timeclock_entry_with_justification' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')
    ) THEN
        ALTER TYPE "AuditAction" ADD VALUE 'timeclock_entry_with_justification';
    END IF;

    -- Adicionar timeclock_exit_with_justification se não existir
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'timeclock_exit_with_justification' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')
    ) THEN
        ALTER TYPE "AuditAction" ADD VALUE 'timeclock_exit_with_justification';
    END IF;
END $$;


