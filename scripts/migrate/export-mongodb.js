import { connectMongoDB, disconnectMongoDB, getCollection } from './utils/mongo-connection.js';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from '../../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mapeamento de coleções MongoDB para nomes de arquivos
const COLLECTIONS = {
  users: 'users.json',
  overtimes: 'overtimes.json',
  hourbankrecords: 'hourbankrecords.json',
  auditlogs: 'auditlogs.json',
  companysettings: 'companysettings.json'
};

const DATA_DIR = join(__dirname, 'data');

/**
 * Exporta uma coleção do MongoDB para JSON
 * @param {string} collectionName - Nome da coleção
 * @returns {Promise<Array>} Array de documentos
 */
async function exportCollection(collectionName) {
  try {
    const collection = getCollection(collectionName);
    const documents = await collection.find({}).toArray();
    
    logger.info(`Exportando coleção: ${collectionName}`, { 
      count: documents.length 
    });
    
    return documents;
  } catch (error) {
    logger.logError(error, { 
      context: `Exportar coleção ${collectionName}` 
    });
    throw error;
  }
}

/**
 * Salva dados em arquivo JSON
 * @param {string} filename - Nome do arquivo
 * @param {Array} data - Dados para salvar
 */
async function saveToFile(filename, data) {
  const filepath = join(DATA_DIR, filename);
  await writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
  logger.info(`Dados salvos em: ${filepath}`, { count: data.length });
}

/**
 * Função principal de exportação
 */
async function exportMongoDB() {
  try {
    // Criar diretório de dados se não existir
    await mkdir(DATA_DIR, { recursive: true });
    
    // Conectar ao MongoDB
    await connectMongoDB();
    
    logger.info('Iniciando exportação do MongoDB...');
    
    const exportedData = {};
    
    // Exportar cada coleção
    for (const [collectionName, filename] of Object.entries(COLLECTIONS)) {
      try {
        const documents = await exportCollection(collectionName);
        await saveToFile(filename, documents);
        exportedData[collectionName] = documents.length;
      } catch (error) {
        logger.logError(error, { 
          context: `Erro ao exportar ${collectionName}` 
        });
        // Continuar com outras coleções mesmo se uma falhar
      }
    }
    
    // Resumo
    logger.info('Exportação concluída!', { 
      collections: exportedData 
    });
    
    return exportedData;
  } catch (error) {
    logger.logError(error, { context: 'Exportação MongoDB' });
    throw error;
  } finally {
    await disconnectMongoDB();
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('export-mongodb.js')) {
  exportMongoDB()
    .then(() => {
      logger.info('✅ Exportação finalizada com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      logger.logError(error, { context: 'Erro fatal na exportação' });
      process.exit(1);
    });
}

export default exportMongoDB;

