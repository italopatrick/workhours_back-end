-- CreateTable
CREATE TABLE IF NOT EXISTS "time_clock_justifications" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_clock_justifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "time_clock_justifications_reason_key" ON "time_clock_justifications"("reason");

-- AlterTable: Adicionar coluna justificationId se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_clocks' 
        AND column_name = 'justificationId'
    ) THEN
        ALTER TABLE "time_clocks" ADD COLUMN "justificationId" TEXT;
    END IF;
END $$;

-- AddForeignKey: Criar constraint apenas se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'time_clocks_justificationId_fkey'
        AND table_name = 'time_clocks'
    ) THEN
        ALTER TABLE "time_clocks" 
        ADD CONSTRAINT "time_clocks_justificationId_fkey" 
        FOREIGN KEY ("justificationId") 
        REFERENCES "time_clock_justifications"("id") 
        ON DELETE SET NULL 
        ON UPDATE CASCADE;
    END IF;
END $$;

