#!/usr/bin/env node
/**
 * Script para verificar e adicionar colunas faltantes na tabela users
 * Aplica as colunas que deveriam ter sido criadas pela migration 20251207220000_add_timeclock
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function fixUsersColumns() {
  try {
    console.log('🔍 Verificando colunas da tabela users...\n');
    
    // Verificar se a tabela users existe
    const usersTableCheck = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      ) as exists;
    `);
    
    const usersExists = Array.isArray(usersTableCheck) && usersTableCheck[0]?.exists || false;
    
    if (!usersExists) {
      console.log('❌ Tabela users não existe!');
      return;
    }
    
    // Lista de colunas que devem existir (da migration 20251207220000_add_timeclock)
    const requiredColumns = [
      { name: 'workSchedule', type: 'JSONB', nullable: true, sqlType: 'JSONB' },
      { name: 'lunchBreakHours', type: 'DOUBLE PRECISION', nullable: true, sqlType: 'DOUBLE PRECISION' },
      { name: 'lateTolerance', type: 'INTEGER', nullable: true, default: '10', sqlType: 'INTEGER' },
      { name: 'requiresTimeClock', type: 'BOOLEAN', nullable: false, default: 'false', sqlType: 'BOOLEAN' },
      { name: 'lastLoginAt', type: 'TIMESTAMP', nullable: true, sqlType: 'TIMESTAMP' }
    ];
    
    // Verificar colunas existentes
    const existingColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'users'
      ORDER BY ordinal_position;
    `);
    
    const existingColumnNames = existingColumns.map(col => col.column_name);
    console.log(`📊 Colunas existentes: ${existingColumnNames.length}`);
    
    let addedCount = 0;
    
    // Verificar e adicionar colunas faltantes
    for (const column of requiredColumns) {
      const columnExists = existingColumnNames.includes(column.name);
      
      if (!columnExists) {
        console.log(`\n⚠️  Coluna ${column.name} não existe. Criando...`);
        
        try {
          let alterStatement = `ALTER TABLE "users" ADD COLUMN "${column.name}" ${column.sqlType || column.type}`;
          
          if (column.default) {
            alterStatement += ` DEFAULT ${column.default}`;
          }
          
          if (column.nullable === false && !column.default) {
            // Se não é nullable e não tem default, usar false como default para boolean
            if (column.type === 'BOOLEAN') {
              alterStatement += ` DEFAULT false`;
            } else {
              alterStatement += ` DEFAULT NULL`;
            }
          }
          
          if (column.nullable === false) {
            alterStatement += ` NOT NULL`;
          }
          
          await prisma.$executeRawUnsafe(alterStatement);
          console.log(`   ✅ Coluna ${column.name} criada!`);
          addedCount++;
        } catch (error) {
          console.error(`   ❌ Erro ao criar coluna ${column.name}:`, error.message);
        }
      } else {
        console.log(`   ✅ Coluna ${column.name} já existe.`);
      }
    }
    
    if (addedCount > 0) {
      console.log(`\n✅ ${addedCount} coluna(s) adicionada(s) com sucesso!`);
    } else {
      console.log('\n✅ Todas as colunas necessárias já existem!');
    }
    
    // Verificar estrutura final
    const finalColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name IN ('workSchedule', 'lunchBreakHours', 'lateTolerance', 'requiresTimeClock', 'lastLoginAt')
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📊 Estrutura final das colunas adicionadas:');
    console.table(finalColumns);
    
  } catch (error) {
    console.error('❌ Erro ao verificar/adicionar colunas:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixUsersColumns()
  .then(() => {
    console.log('\n✅ Script concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });

