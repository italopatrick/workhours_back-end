-- AlterEnum
-- Adiciona 'manager' ao enum UserRole
-- Nota: ADD VALUE não suporta IF NOT EXISTS, então verificamos antes
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'manager' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')
    ) THEN
        ALTER TYPE "UserRole" ADD VALUE 'manager';
    END IF;
END $$;

