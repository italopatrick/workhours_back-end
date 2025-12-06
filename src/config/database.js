import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

// Singleton pattern para Prisma Client
let prisma = null;

export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'error', 'warn'] 
        : ['error'],
      errorFormat: 'pretty',
    });

    // Handle connection errors
    prisma.$on('error' as never, (e) => {
      logger.logError(e, { context: 'Prisma Client Error' });
    });
  }
  return prisma;
}

// Função para conectar ao banco de dados
export async function connectDB() {
  try {
    const client = getPrismaClient();
    await client.$connect();
    logger.info('PostgreSQL Connected via Prisma');
    return client;
  } catch (error) {
    logger.logError(error, { context: 'PostgreSQL Connection' });
    throw error;
  }
}

// Função para desconectar do banco de dados
export async function disconnectDB() {
  try {
    if (prisma) {
      await prisma.$disconnect();
      logger.info('PostgreSQL Disconnected');
      prisma = null;
    }
  } catch (error) {
    logger.logError(error, { context: 'PostgreSQL Disconnection' });
    throw error;
  }
}

// Exportar instância padrão
export default getPrismaClient();

