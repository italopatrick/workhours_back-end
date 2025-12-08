#!/usr/bin/env node
/**
 * Script para aplicar migration de justificativas manualmente
 * Execute: node scripts/apply-justification-migration.js
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function applyMigration() {
  try {
    console.log('📦 Aplicando migration de justificativas...');
    
    // Ler o arquivo de migration
    const migrationPath = path.join(
      __dirname,
      '../prisma/migrations/20251208125741_add_timeclock_justification/migration.sql'
    );
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('🔍 Verificando se a tabela já existe...');
    
    // Verificar se a tabela já existe
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'time_clock_justifications'
      );
    `;
    
    if (tableExists[0]?.exists) {
      console.log('✅ Tabela time_clock_justifications já existe!');
    } else {
      console.log('📝 Criando tabela time_clock_justifications...');
      
      // Executar o SQL da migration
      await prisma.$executeRawUnsafe(migrationSQL);
      
      console.log('✅ Migration aplicada com sucesso!');
      console.log('✅ Tabela time_clock_justifications criada!');
    }
    
    // Verificar estrutura da tabela
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'time_clock_justifications'
      ORDER BY ordinal_position;
    `;
    
    console.log('\n📊 Estrutura da tabela:');
    console.table(columns);
    
  } catch (error) {
    console.error('❌ Erro ao aplicar migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration()
  .then(() => {
    console.log('\n✅ Script concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });

