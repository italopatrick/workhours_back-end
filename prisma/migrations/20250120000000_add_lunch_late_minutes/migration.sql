-- Migration: Add lunchLateMinutes column to time_clocks table
-- Description: Adiciona coluna para armazenar minutos de atraso no retorno do almoço
-- Date: 2025-01-20

-- AlterTable: Adicionar coluna lunchLateMinutes se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_clocks' 
        AND column_name = 'lunchLateMinutes'
    ) THEN
        ALTER TABLE "time_clocks" ADD COLUMN "lunchLateMinutes" INTEGER;
        
        -- Comentário na coluna para documentação
        COMMENT ON COLUMN "time_clocks"."lunchLateMinutes" IS 'Minutos de atraso no retorno do almoço';
    END IF;
END $$;

