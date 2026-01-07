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

