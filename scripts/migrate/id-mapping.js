import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import logger from '../../src/utils/logger.js';
import { isValidObjectId } from './utils/validators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, 'data');
const MAPPING_FILE = join(__dirname, 'id-mapping.json');

// Arquivos JSON exportados
const COLLECTION_FILES = {
  users: 'users.json',
  overtimes: 'overtimes.json',
  hourbankrecords: 'hourbankrecords.json',
  auditlogs: 'auditlogs.json',
  companysettings: 'companysettings.json'
};

/**
 * Carrega dados de um arquivo JSON
 * @param {string} filename
 * @returns {Promise<Array>}
 */
async function loadJSONFile(filename) {
  try {
    const filepath = join(DATA_DIR, filename);
    const content = await readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn(`Arquivo não encontrado: ${filename}`);
      return [];
    }
    throw error;
  }
}

/**
 * Extrai ObjectId de um documento MongoDB
 * @param {Object} doc - Documento MongoDB
 * @returns {string|null} ObjectId como string ou null
 */
function extractObjectId(doc) {
  if (!doc) return null;
  
  // MongoDB pode ter _id como ObjectId ou string
  if (doc._id) {
    // Se for ObjectId, converter para string
    if (typeof doc._id === 'object' && doc._id.toString) {
      return doc._id.toString();
    }
    return String(doc._id);
  }
  
  return null;
}

/**
 * Cria mapeamento de ObjectIds para UUIDs
 * @returns {Promise<Object>} Mapeamento { collection: { objectId: uuid } }
 */
async function createIdMapping() {
  logger.info('Criando mapeamento de ObjectIds para UUIDs...');
  
  const mapping = {
    users: {},
    overtimes: {},
    hourbankrecords: {},
    auditlogs: {},
    companysettings: {}
  };
  
  // Processar cada coleção
  for (const [collectionName, filename] of Object.entries(COLLECTION_FILES)) {
    try {
      const documents = await loadJSONFile(filename);
      
      logger.info(`Processando ${collectionName}...`, { count: documents.length });
      
      for (const doc of documents) {
        const objectId = extractObjectId(doc);
        
        if (objectId && isValidObjectId(objectId)) {
          // Gerar UUID único para este ObjectId
          const uuid = randomUUID();
          mapping[collectionName][objectId] = uuid;
        } else if (objectId) {
          // Se não for ObjectId válido mas tiver _id, ainda mapear
          const uuid = randomUUID();
          mapping[collectionName][objectId] = uuid;
          logger.warn(`ObjectId inválido mapeado: ${objectId}`, { collection: collectionName });
        }
      }
      
      logger.info(`Mapeamento criado para ${collectionName}`, { 
        count: Object.keys(mapping[collectionName]).length 
      });
    } catch (error) {
      logger.logError(error, { context: `Erro ao processar ${collectionName}` });
      // Continuar com outras coleções
    }
  }
  
  // Salvar mapeamento em arquivo
  await writeFile(MAPPING_FILE, JSON.stringify(mapping, null, 2), 'utf-8');
  logger.info(`Mapeamento salvo em: ${MAPPING_FILE}`);
  
  // Estatísticas
  const totalMappings = Object.values(mapping).reduce(
    (sum, coll) => sum + Object.keys(coll).length, 
    0
  );
  logger.info('Mapeamento concluído!', { totalMappings });
  
  return mapping;
}

/**
 * Carrega mapeamento existente
 * @returns {Promise<Object|null>}
 */
export async function loadIdMapping() {
  try {
    const content = await readFile(MAPPING_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Obtém UUID para um ObjectId
 * @param {Object} mapping - Mapeamento completo
 * @param {string} collection - Nome da coleção
 * @param {string} objectId - ObjectId
 * @returns {string|null} UUID ou null
 */
export function getUUIDFromMapping(mapping, collection, objectId) {
  if (!mapping || !mapping[collection] || !objectId) {
    return null;
  }
  
  const objectIdStr = String(objectId);
  return mapping[collection][objectIdStr] || null;
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('id-mapping.js')) {
  createIdMapping()
    .then(() => {
      logger.info('✅ Mapeamento de IDs criado com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      logger.logError(error, { context: 'Erro fatal no mapeamento' });
      process.exit(1);
    });
}

export default createIdMapping;

