import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../../../src/utils/logger.js';

dotenv.config();

/**
 * Conecta ao MongoDB usando Mongoose
 * @returns {Promise<mongoose.Connection>}
 */
export async function connectMongoDB() {
  const mongoUri = process.env.MONGODB_URI;
  
  if (!mongoUri) {
    throw new Error('MONGODB_URI não está configurada no .env');
  }

  try {
    await mongoose.connect(mongoUri);
    logger.info('Conectado ao MongoDB', { uri: mongoUri.replace(/\/\/.*@/, '//***@') });
    return mongoose.connection;
  } catch (error) {
    logger.logError(error, { context: 'Conexão MongoDB' });
    throw error;
  }
}

/**
 * Desconecta do MongoDB
 */
export async function disconnectMongoDB() {
  try {
    await mongoose.disconnect();
    logger.info('Desconectado do MongoDB');
  } catch (error) {
    logger.logError(error, { context: 'Desconexão MongoDB' });
    throw error;
  }
}

/**
 * Obtém uma coleção do MongoDB
 * @param {string} collectionName - Nome da coleção
 * @returns {mongoose.Collection}
 */
export function getCollection(collectionName) {
  return mongoose.connection.db.collection(collectionName);
}

