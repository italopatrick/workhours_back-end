-- Migration: Add lastLoginAt column to users table
-- Description: Adiciona coluna para rastrear data e hora do último login
-- Date: 2025-01-20

-- AlterTable: Adicionar coluna lastLoginAt se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'lastLoginAt'
    ) THEN
        ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP;
        
        -- Comentário na coluna para documentação
        COMMENT ON COLUMN "users"."lastLoginAt" IS 'Data e hora do último login do usuário';
    END IF;
END $$;

