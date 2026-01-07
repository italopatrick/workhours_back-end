#!/usr/bin/env node
/**
 * Script para verificar e adicionar colunas faltantes na tabela time_clocks
 * Aplica as colunas que deveriam ter sido criadas pelas migrations
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function fixTimeClocksColumns() {
  try {
    console.log('🔍 Verificando colunas da tabela time_clocks...\n');
    
    // Verificar se a tabela time_clocks existe
    const timeClocksTableCheck = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'time_clocks'
      ) as exists;
    `);
    
    const timeClocksExists = Array.isArray(timeClocksTableCheck) && timeClocksTableCheck[0]?.exists || false;
    
    if (!timeClocksExists) {
      console.log('⚠️  Tabela time_clocks não existe ainda. Nada para corrigir.');
      return;
    }
    
    // Lista de colunas que devem existir
    const requiredColumns = [
      { name: 'lunchLateMinutes', type: 'INTEGER', nullable: true, sqlType: 'INTEGER' },
      { name: 'justificationId', type: 'TEXT', nullable: true, sqlType: 'TEXT' },
      { name: 'justification', type: 'TEXT', nullable: true, sqlType: 'TEXT' }
    ];
    
    // Verificar colunas existentes
    const existingColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'time_clocks'
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
          let alterStatement = `ALTER TABLE "time_clocks" ADD COLUMN "${column.name}" ${column.sqlType || column.type}`;
          
          if (column.nullable === false) {
            alterStatement += ` NOT NULL`;
          }
          
          await prisma.$executeRawUnsafe(alterStatement);
          
          // Adicionar comentário para lunchLateMinutes
          if (column.name === 'lunchLateMinutes') {
            await prisma.$executeRawUnsafe(`
              COMMENT ON COLUMN "time_clocks"."lunchLateMinutes" IS 'Minutos de atraso no retorno do almoço';
            `);
          }
          
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
      AND table_name = 'time_clocks'
      AND column_name IN ('lunchLateMinutes', 'justificationId', 'justification')
      ORDER BY ordinal_position;
    `);
    
    if (finalColumns && finalColumns.length > 0) {
      console.log('\n📊 Estrutura final das colunas verificadas:');
      console.table(finalColumns);
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar/adicionar colunas:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixTimeClocksColumns()
  .then(() => {
    console.log('\n✅ Script concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });

