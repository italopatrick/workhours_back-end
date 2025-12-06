import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../../../src/utils/logger.js';
import { getDatabaseUrl } from '../../../src/config/databaseUrl.js';

// Carregar .env da raiz do projeto
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../../../');
dotenv.config({ path: join(projectRoot, '.env') });

// Garantir que DATABASE_URL está configurada
if (!process.env.DATABASE_URL) {
  try {
    process.env.DATABASE_URL = getDatabaseUrl();
    logger.info('DATABASE_URL construída a partir de variáveis individuais');
  } catch (error) {
    logger.logError(error, { context: 'Configurar DATABASE_URL' });
  }
}

let prisma = null;

/**
 * Obtém instância do Prisma Client
 * @returns {PrismaClient}
 */
export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
      errorFormat: 'pretty',
    });
  }
  return prisma;
}

/**
 * Conecta ao PostgreSQL via Prisma
 * @returns {Promise<PrismaClient>}
 */
export async function connectPostgreSQL() {
  try {
    const client = getPrismaClient();
    await client.$connect();
    logger.info('Conectado ao PostgreSQL via Prisma');
    return client;
  } catch (error) {
    logger.logError(error, { context: 'Conexão PostgreSQL' });
    throw error;
  }
}

/**
 * Desconecta do PostgreSQL
 */
export async function disconnectPostgreSQL() {
  try {
    if (prisma) {
      await prisma.$disconnect();
      logger.info('Desconectado do PostgreSQL');
      prisma = null;
    }
  } catch (error) {
    logger.logError(error, { context: 'Desconexão PostgreSQL' });
    throw error;
  }
}

