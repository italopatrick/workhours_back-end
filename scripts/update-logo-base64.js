#!/usr/bin/env node

/**
 * Script para atualizar logo da empresa usando base64
 * 
 * Uso:
 *   node scripts/update-logo-base64.js <base64_string> <content_type>
 * 
 * Exemplo:
 *   node scripts/update-logo-base64.js "iVBORw0KGgoAAAANS..." "image/png"
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import prisma from '../src/config/database.js';
import logger from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar .env
dotenv.config({ path: join(__dirname, '../.env') });

/**
 * Converte base64 string para Buffer
 * @param {string} base64 - String base64
 * @returns {Buffer}
 */
function base64ToBuffer(base64) {
  // Remove prefixo data:image/...;base64, se existir
  const base64Data = base64.replace(/^data:image\/[a-z]+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

async function updateLogo(base64String, contentType = 'image/png') {
  try {
    // Converter base64 para Buffer
    const logoBuffer = base64ToBuffer(base64String);
    
    logger.info('Convertendo base64 para Buffer...', { 
      bufferSize: logoBuffer.length,
      contentType 
    });
    
    // Obter ou criar configurações
    let settings = await prisma.companySettings.findFirst();
    
    if (!settings) {
      settings = await prisma.companySettings.create({
        data: {
          name: '',
          reportHeader: '',
          reportFooter: '',
          defaultOvertimeLimit: 40,
          defaultAccumulationLimit: 0,
          defaultUsageLimit: 0,
          logo: logoBuffer,
          logoContentType: contentType
        }
      });
      logger.info('Configurações criadas com logo');
    } else {
      settings = await prisma.companySettings.update({
        where: { id: settings.id },
        data: {
          logo: logoBuffer,
          logoContentType: contentType
        }
      });
      logger.info('Logo atualizada com sucesso');
    }
    
    logger.info('✅ Logo atualizada!', {
      id: settings.id,
      contentType: settings.logoContentType,
      logoSize: settings.logo ? settings.logo.length : 0
    });
    
    return settings;
  } catch (error) {
    logger.logError(error, { context: 'Atualizar logo via base64' });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const base64String = process.argv[2];
  const contentType = process.argv[3] || 'image/png';
  
  if (!base64String) {
    console.error('❌ Erro: Base64 string é obrigatória');
    console.log('\nUso:');
    console.log('  node scripts/update-logo-base64.js <base64_string> [content_type]');
    console.log('\nExemplo:');
    console.log('  node scripts/update-logo-base64.js "iVBORw0KGgoAAAANS..." "image/png"');
    process.exit(1);
  }
  
  updateLogo(base64String, contentType)
    .then(() => {
      console.log('✅ Logo atualizada com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro ao atualizar logo:', error.message);
      process.exit(1);
    });
}

export default updateLogo;

