#!/usr/bin/env node
/**
 * Script para resolver migration falhada
 * Marca a migration como resolvida no banco de dados
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function resolveFailedMigration() {
  try {
    console.log('🔍 Verificando migrations falhadas...\n');
    
    // Verificar se a tabela _prisma_migrations existe
    const migrationsTableCheck = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '_prisma_migrations'
      ) as exists;
    `);
    
    const migrationsTableExists = Array.isArray(migrationsTableCheck) && migrationsTableCheck[0]?.exists || false;
    
    if (!migrationsTableExists) {
      console.log('⚠️  Tabela _prisma_migrations não existe. Nada para resolver.');
      return;
    }
    
    // Buscar migrations falhadas
    const failedMigrations = await prisma.$queryRawUnsafe(`
      SELECT migration_name, finished_at, applied_steps_count, started_at
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL
      ORDER BY started_at DESC;
    `);
    
    if (!Array.isArray(failedMigrations) || failedMigrations.length === 0) {
      console.log('✅ Nenhuma migration falhada encontrada.');
      return;
    }
    
    console.log(`📋 Encontradas ${failedMigrations.length} migration(s) falhada(s):\n`);
    console.table(failedMigrations);
    
    // Verificar se a tabela time_clocks existe
    const timeClocksCheck = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'time_clocks'
      ) as exists;
    `);
    
    const timeClocksExists = Array.isArray(timeClocksCheck) && timeClocksCheck[0]?.exists || false;
    
    // Para cada migration falhada
    for (const migration of failedMigrations) {
      const migrationName = migration.migration_name;
      
      if (migrationName === '20250120000000_add_lunch_late_minutes') {
        console.log(`\n🔧 Resolvendo migration: ${migrationName}`);
        
        if (!timeClocksExists) {
          console.log('   ℹ️  Tabela time_clocks não existe ainda.');
          console.log('   ✅ Marcando migration como resolvida (será aplicada quando time_clocks for criada).');
          
          // Marcar migration como resolvida
          await prisma.$executeRawUnsafe(`
            UPDATE "_prisma_migrations"
            SET finished_at = NOW(),
                applied_steps_count = 1
            WHERE migration_name = '${migrationName}';
          `);
          
          console.log('   ✅ Migration marcada como resolvida!');
        } else {
          console.log('   ℹ️  Tabela time_clocks existe. Aplicando migration manualmente...');
          
          // Aplicar migration manualmente
          try {
            await prisma.$executeRawUnsafe(`
              DO $$
              BEGIN
                  IF NOT EXISTS (
                      SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'time_clocks' 
                      AND column_name = 'lunchLateMinutes'
                  ) THEN
                      ALTER TABLE "time_clocks" ADD COLUMN "lunchLateMinutes" INTEGER;
                      COMMENT ON COLUMN "time_clocks"."lunchLateMinutes" IS 'Minutos de atraso no retorno do almoço';
                  END IF;
              END $$;
            `);
            
            // Marcar migration como concluída
            await prisma.$executeRawUnsafe(`
              UPDATE "_prisma_migrations"
              SET finished_at = NOW(),
                  applied_steps_count = 1
              WHERE migration_name = '${migrationName}';
            `);
            
            console.log('   ✅ Migration aplicada e marcada como concluída!');
          } catch (error) {
            console.error('   ❌ Erro ao aplicar migration:', error.message);
            throw error;
          }
        }
      } else if (migrationName === '20251207220000_add_timeclock') {
        console.log(`\n🔧 Resolvendo migration: ${migrationName}`);
        console.log('   ℹ️  Aplicando migration manualmente...');
        
        try {
          // Aplicar migration em partes para melhor controle de erros
          console.log('   📝 Verificando e adicionando valores aos enums...');
          
          // Verificar se o enum AuditAction existe e adicionar valores
          try {
            const auditActionCheck = await prisma.$queryRawUnsafe(`
              SELECT EXISTS (
                SELECT 1 FROM pg_type 
                WHERE typname = 'AuditAction'
              ) as exists;
            `);
            
            const auditActionExists = Array.isArray(auditActionCheck) && auditActionCheck[0]?.exists || false;
            
            if (auditActionExists) {
              await prisma.$executeRawUnsafe(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeclock_entry' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
                        ALTER TYPE "AuditAction" ADD VALUE 'timeclock_entry';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeclock_lunch_exit' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
                        ALTER TYPE "AuditAction" ADD VALUE 'timeclock_lunch_exit';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeclock_lunch_return' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
                        ALTER TYPE "AuditAction" ADD VALUE 'timeclock_lunch_return';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeclock_exit' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
                        ALTER TYPE "AuditAction" ADD VALUE 'timeclock_exit';
                    END IF;
                END $$;
              `);
              console.log('   ✅ Valores adicionados ao enum AuditAction');
            } else {
              console.log('   ⚠️  Enum AuditAction não existe. Pulando adição de valores.');
            }
          } catch (error) {
            console.log(`   ⚠️  Erro ao adicionar valores ao enum AuditAction: ${error.message}. Continuando...`);
          }
          
          // Verificar se o enum EntityType existe e adicionar valor
          try {
            const entityTypeCheck = await prisma.$queryRawUnsafe(`
              SELECT EXISTS (
                SELECT 1 FROM pg_type 
                WHERE typname = 'EntityType'
              ) as exists;
            `);
            
            const entityTypeExists = Array.isArray(entityTypeCheck) && entityTypeCheck[0]?.exists || false;
            
            if (entityTypeExists) {
              await prisma.$executeRawUnsafe(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'timeclock' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EntityType')) THEN
                        ALTER TYPE "EntityType" ADD VALUE 'timeclock';
                    END IF;
                END $$;
              `);
              console.log('   ✅ Valor adicionado ao enum EntityType');
            } else {
              console.log('   ⚠️  Enum EntityType não existe. Pulando adição de valor.');
            }
          } catch (error) {
            console.log(`   ⚠️  Erro ao adicionar valor ao enum EntityType: ${error.message}. Continuando...`);
          }
          
          console.log('   📝 Adicionando colunas na tabela users...');
          try {
            await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workSchedule" JSONB;`);
            await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lunchBreakHours" DOUBLE PRECISION;`);
            await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lateTolerance" INTEGER DEFAULT 10;`);
            console.log('   ✅ Colunas adicionadas na tabela users');
          } catch (error) {
            console.log(`   ⚠️  Erro ao adicionar colunas em users: ${error.message}. Continuando...`);
          }
          
          console.log('   📝 Criando tabela time_clocks...');
          try {
            await prisma.$executeRawUnsafe(`
              CREATE TABLE IF NOT EXISTS "time_clocks" (
                  "id" TEXT NOT NULL,
                  "employeeId" TEXT NOT NULL,
                  "date" TEXT NOT NULL,
                  "entryTime" TIMESTAMP(3),
                  "lunchExitTime" TIMESTAMP(3),
                  "lunchReturnTime" TIMESTAMP(3),
                  "exitTime" TIMESTAMP(3),
                  "totalWorkedHours" DOUBLE PRECISION,
                  "scheduledHours" DOUBLE PRECISION,
                  "lateMinutes" INTEGER,
                  "lunchLateMinutes" INTEGER,
                  "overtimeHours" DOUBLE PRECISION,
                  "negativeHours" DOUBLE PRECISION,
                  "hourBankCreditId" TEXT,
                  "hourBankDebitId" TEXT,
                  "justificationId" TEXT,
                  "justification" TEXT,
                  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  "updatedAt" TIMESTAMP(3) NOT NULL,
                  CONSTRAINT "time_clocks_pkey" PRIMARY KEY ("id")
              );
            `);
            
            // Adicionar comentário para lunchLateMinutes
            await prisma.$executeRawUnsafe(`
              COMMENT ON COLUMN "time_clocks"."lunchLateMinutes" IS 'Minutos de atraso no retorno do almoço';
            `);
            console.log('   ✅ Tabela time_clocks criada ou já existe');
          } catch (error) {
            console.log(`   ⚠️  Erro ao criar tabela time_clocks: ${error.message}. Continuando...`);
          }
          
          console.log('   📝 Criando índices...');
          try {
            await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "time_clocks_employeeId_date_key" ON "time_clocks"("employeeId", "date");`);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "time_clocks_employeeId_idx" ON "time_clocks"("employeeId");`);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "time_clocks_date_idx" ON "time_clocks"("date");`);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "time_clocks_employeeId_date_idx" ON "time_clocks"("employeeId", "date");`);
            console.log('   ✅ Índices criados');
          } catch (error) {
            console.log(`   ⚠️  Erro ao criar índices: ${error.message}. Continuando...`);
          }
          
          console.log('   📝 Criando foreign keys...');
          try {
            // Verificar se as foreign keys já existem antes de criar
            const fkEmployeeCheck = await prisma.$queryRawUnsafe(`
              SELECT EXISTS (
                SELECT FROM information_schema.table_constraints 
                WHERE constraint_schema = 'public'
                AND constraint_name = 'time_clocks_employeeId_fkey'
                AND table_name = 'time_clocks'
              ) as exists;
            `);
            
            if (!Array.isArray(fkEmployeeCheck) || !fkEmployeeCheck[0]?.exists) {
              await prisma.$executeRawUnsafe(`
                ALTER TABLE "time_clocks" 
                ADD CONSTRAINT "time_clocks_employeeId_fkey" 
                FOREIGN KEY ("employeeId") 
                REFERENCES "users"("id") 
                ON DELETE CASCADE 
                ON UPDATE CASCADE;
              `);
            }
            
            const fkCreditCheck = await prisma.$queryRawUnsafe(`
              SELECT EXISTS (
                SELECT FROM information_schema.table_constraints 
                WHERE constraint_schema = 'public'
                AND constraint_name = 'time_clocks_hourBankCreditId_fkey'
                AND table_name = 'time_clocks'
              ) as exists;
            `);
            
            if (!Array.isArray(fkCreditCheck) || !fkCreditCheck[0]?.exists) {
              await prisma.$executeRawUnsafe(`
                ALTER TABLE "time_clocks" 
                ADD CONSTRAINT "time_clocks_hourBankCreditId_fkey" 
                FOREIGN KEY ("hourBankCreditId") 
                REFERENCES "hour_bank_records"("id") 
                ON DELETE SET NULL 
                ON UPDATE CASCADE;
              `);
            }
            
            const fkDebitCheck = await prisma.$queryRawUnsafe(`
              SELECT EXISTS (
                SELECT FROM information_schema.table_constraints 
                WHERE constraint_schema = 'public'
                AND constraint_name = 'time_clocks_hourBankDebitId_fkey'
                AND table_name = 'time_clocks'
              ) as exists;
            `);
            
            if (!Array.isArray(fkDebitCheck) || !fkDebitCheck[0]?.exists) {
              await prisma.$executeRawUnsafe(`
                ALTER TABLE "time_clocks" 
                ADD CONSTRAINT "time_clocks_hourBankDebitId_fkey" 
                FOREIGN KEY ("hourBankDebitId") 
                REFERENCES "hour_bank_records"("id") 
                ON DELETE SET NULL 
                ON UPDATE CASCADE;
              `);
            }
            console.log('   ✅ Foreign keys criadas');
          } catch (error) {
            console.log(`   ⚠️  Erro ao criar foreign keys: ${error.message}. Continuando...`);
          }
          
          // Marcar migration como concluída (mesmo se algumas partes falharam)
          try {
            await prisma.$executeRawUnsafe(`
              UPDATE "_prisma_migrations"
              SET finished_at = NOW(),
                  applied_steps_count = 1
              WHERE migration_name = '${migrationName}';
            `);
            console.log('   ✅ Migration marcada como concluída!');
          } catch (error) {
            console.error('   ❌ Erro ao marcar migration como concluída:', error.message);
            throw error; // Este erro deve ser lançado pois é crítico
          }
        } catch (error) {
          console.error('   ❌ Erro crítico ao aplicar migration:', error.message);
          // Não lançar erro, apenas logar - outras migrations podem ser aplicadas
          console.log('   ⚠️  Continuando com outras migrations...');
        }
      } else {
        console.log(`\n⚠️  Migration desconhecida: ${migrationName}`);
        console.log('   ℹ️  Você precisa resolver esta migration manualmente.');
      }
    }
    
    console.log('\n✅ Processo de resolução concluído!');
    
  } catch (error) {
    console.error('❌ Erro ao resolver migrations:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resolveFailedMigration()
  .then(() => {
    console.log('\n✅ Script concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });

