-- Migration: Add requiresTimeClock column to users table
-- Description: Adiciona coluna para marcar se funcionário precisa bater ponto
-- Date: 2025-01-20

-- AlterTable: Adicionar coluna requiresTimeClock se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'requiresTimeClock'
    ) THEN
        ALTER TABLE "users" ADD COLUMN "requiresTimeClock" BOOLEAN DEFAULT false;
        
        -- Comentário na coluna para documentação
        COMMENT ON COLUMN "users"."requiresTimeClock" IS 'Se true, funcionário precisa bater ponto';
    END IF;
END $$;

