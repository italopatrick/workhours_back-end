#!/usr/bin/env node
/**
 * Script para verificar e corrigir migration de justificativas
 * Verifica se a tabela existe e aplica a migration se necessário
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function checkAndFix() {
  try {
    console.log('🔍 Verificando se a tabela time_clock_justifications existe...\n');
    
    // Verificar se a tabela existe
    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'time_clock_justifications'
      ) as exists;
    `;
    
    const tableExists = tableCheck[0]?.exists || false;
    
    if (tableExists) {
      console.log('✅ Tabela time_clock_justifications já existe!');
      
      // Verificar estrutura
      const columns = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'time_clock_justifications'
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📊 Estrutura atual da tabela:');
      console.table(columns);
      
      // Verificar se a coluna justificationId existe em time_clocks
      const columnCheck = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public'
          AND table_name = 'time_clocks' 
          AND column_name = 'justificationId'
        ) as exists;
      `);
      
      const columnExists = Array.isArray(columnCheck) && columnCheck[0]?.exists || false;
      
      if (!columnExists) {
        console.log('\n⚠️  Coluna justificationId não existe em time_clocks. Criando...');
        await prisma.$executeRaw`ALTER TABLE "time_clocks" ADD COLUMN IF NOT EXISTS "justificationId" TEXT;`;
        console.log('✅ Coluna justificationId criada!');
      }
      
    } else {
      console.log('❌ Tabela time_clock_justifications NÃO existe!');
      console.log('📝 Criando tabela agora...\n');
      
      // Criar tabela
      await prisma.$executeRaw`
        CREATE TABLE "time_clock_justifications" (
          "id" TEXT NOT NULL,
          "reason" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "time_clock_justifications_pkey" PRIMARY KEY ("id")
        );
      `;
      
      // Criar índice único
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "time_clock_justifications_reason_key" 
        ON "time_clock_justifications"("reason");
      `;
      
      // Adicionar coluna em time_clocks
      await prisma.$executeRaw`
        ALTER TABLE "time_clocks" ADD COLUMN IF NOT EXISTS "justificationId" TEXT;
      `;
      
      // Criar foreign key
      const fkCheck = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.table_constraints 
          WHERE constraint_schema = 'public'
          AND constraint_name = 'time_clocks_justificationId_fkey'
          AND table_name = 'time_clocks'
        ) as exists;
      `);
      
      const fkExists = Array.isArray(fkCheck) && fkCheck[0]?.exists || false;
      
      if (!fkExists) {
        await prisma.$executeRaw`
          ALTER TABLE "time_clocks" 
          ADD CONSTRAINT "time_clocks_justificationId_fkey" 
          FOREIGN KEY ("justificationId") 
          REFERENCES "time_clock_justifications"("id") 
          ON DELETE SET NULL 
          ON UPDATE CASCADE;
        `;
      }
      
      console.log('✅ Tabela time_clock_justifications criada com sucesso!');
      
      // Verificar estrutura criada
      const newColumns = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'time_clock_justifications'
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📊 Estrutura da tabela criada:');
      console.table(newColumns);
    }
    
    // Testar criação de uma justificativa
    console.log('\n🧪 Testando criação de justificativa...');
    try {
      const testJustification = await prisma.timeClockJustification.create({
        data: {
          reason: 'TESTE - Pode ser deletada',
          isActive: false
        }
      });
      console.log('✅ Teste de criação bem-sucedido!');
      console.log('   ID:', testJustification.id);
      console.log('   Motivo:', testJustification.reason);
      
      // Deletar justificativa de teste
      await prisma.timeClockJustification.delete({
        where: { id: testJustification.id }
      });
      console.log('✅ Justificativa de teste removida.');
    } catch (testError) {
      console.error('❌ Erro ao testar criação:', testError.message);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkAndFix()
  .then(() => {
    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });

