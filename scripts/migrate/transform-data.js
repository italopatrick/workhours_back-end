import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadIdMapping, getUUIDFromMapping } from './id-mapping.js';
import logger from '../../src/utils/logger.js';
import {
  isValidUserRole,
  isValidOvertimeStatus,
  isValidHourBankType,
  isValidHourBankStatus,
  isValidAuditAction,
  isValidEntityType,
  isValidDateFormat,
  isValidTimeFormat,
  isValidEmail
} from './utils/validators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, 'data');
const TRANSFORMED_DIR = join(__dirname, 'transformed');

/**
 * Converte ObjectId para UUID usando mapeamento
 * @param {Object} mapping - Mapeamento de IDs
 * @param {string} collection - Nome da coleção
 * @param {any} objectId - ObjectId (pode ser ObjectId, string, etc.)
 * @returns {string|null} UUID ou null
 */
function convertObjectId(mapping, collection, objectId) {
  if (!objectId) return null;
  
  // Converter para string
  const objectIdStr = typeof objectId === 'object' && objectId.toString
    ? objectId.toString()
    : String(objectId);
  
  return getUUIDFromMapping(mapping, collection, objectIdStr);
}

/**
 * Converte ISODate para DateTime (ISO string)
 * @param {any} date - Data do MongoDB
 * @returns {string|null} ISO string ou null
 */
function convertDate(date) {
  if (!date) return null;
  
  if (date instanceof Date) {
    return date.toISOString();
  }
  
  if (typeof date === 'string') {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  
  return null;
}

/**
 * Converte Buffer para Base64 string
 * @param {any} buffer - Buffer do MongoDB
 * @returns {string|null} Base64 string ou null
 */
function convertBuffer(buffer) {
  if (!buffer) return null;
  
  if (Buffer.isBuffer(buffer)) {
    return buffer.toString('base64');
  }
  
  if (typeof buffer === 'object' && buffer.data) {
    // MongoDB pode armazenar Buffer como { type: 'Buffer', data: [...] }
    if (Array.isArray(buffer.data)) {
      return Buffer.from(buffer.data).toString('base64');
    }
  }
  
  return null;
}

/**
 * Transforma documento User
 */
function transformUser(doc, mapping) {
  const objectId = doc._id;
  const uuid = convertObjectId(mapping, 'users', objectId);
  
  if (!uuid) {
    throw new Error(`Não foi possível mapear ObjectId para User: ${objectId}`);
  }
  
  // Validar email
  if (!isValidEmail(doc.email)) {
    throw new Error(`Email inválido para User: ${doc.email}`);
  }
  
  // Validar role
  if (doc.role && !isValidUserRole(doc.role)) {
    logger.warn(`Role inválido para User ${doc.email}, usando 'employee'`, { role: doc.role });
    doc.role = 'employee';
  }
  
  return {
    id: uuid,
    email: doc.email,
    password: doc.password || null,
    role: doc.role || 'employee',
    name: doc.name || '',
    department: doc.department || '',
    externalId: doc.externalId ? String(doc.externalId) : null,
    externalAuth: doc.externalAuth || false,
    overtimeLimit: doc.overtimeLimit || null,
    overtimeExceptions: doc.overtimeExceptions || null,
    createdAt: convertDate(doc.createdAt) || new Date().toISOString(),
    updatedAt: convertDate(doc.updatedAt) || new Date().toISOString()
  };
}

/**
 * Transforma documento Overtime
 */
function transformOvertime(doc, mapping) {
  const objectId = doc._id;
  const uuid = convertObjectId(mapping, 'overtimes', objectId);
  
  if (!uuid) {
    throw new Error(`Não foi possível mapear ObjectId para Overtime: ${objectId}`);
  }
  
  // Converter employeeId
  const employeeId = convertObjectId(mapping, 'users', doc.employeeId);
  if (!employeeId) {
    throw new Error(`employeeId inválido para Overtime: ${doc.employeeId}`);
  }
  
  // Validar status
  if (doc.status && !isValidOvertimeStatus(doc.status)) {
    logger.warn(`Status inválido para Overtime, usando 'pending'`, { status: doc.status });
    doc.status = 'pending';
  }
  
  // Validar formato de data
  if (!isValidDateFormat(doc.date)) {
    throw new Error(`Data inválida para Overtime: ${doc.date}`);
  }
  
  // Validar formato de hora
  if (doc.startTime && !isValidTimeFormat(doc.startTime)) {
    throw new Error(`startTime inválido para Overtime: ${doc.startTime}`);
  }
  
  if (doc.endTime && !isValidTimeFormat(doc.endTime)) {
    throw new Error(`endTime inválido para Overtime: ${doc.endTime}`);
  }
  
  return {
    id: uuid,
    employeeId: employeeId,
    date: doc.date,
    startTime: doc.startTime || '00:00',
    endTime: doc.endTime || '00:00',
    hours: doc.hours || 0,
    reason: doc.reason || '',
    status: doc.status || 'pending',
    createdBy: doc.createdBy ? convertObjectId(mapping, 'users', doc.createdBy) : null,
    approvedBy: doc.approvedBy ? convertObjectId(mapping, 'users', doc.approvedBy) : null,
    rejectedBy: doc.rejectedBy ? convertObjectId(mapping, 'users', doc.rejectedBy) : null,
    approvedAt: doc.approvedAt ? convertDate(doc.approvedAt) : null,
    rejectedAt: doc.rejectedAt ? convertDate(doc.rejectedAt) : null,
    createdAt: convertDate(doc.createdAt) || new Date().toISOString(),
    updatedAt: convertDate(doc.updatedAt) || new Date().toISOString()
  };
}

/**
 * Transforma documento HourBankRecord
 */
function transformHourBankRecord(doc, mapping) {
  const objectId = doc._id;
  const uuid = convertObjectId(mapping, 'hourbankrecords', objectId);
  
  if (!uuid) {
    throw new Error(`Não foi possível mapear ObjectId para HourBankRecord: ${objectId}`);
  }
  
  // Converter employeeId
  const employeeId = convertObjectId(mapping, 'users', doc.employeeId);
  if (!employeeId) {
    throw new Error(`employeeId inválido para HourBankRecord: ${doc.employeeId}`);
  }
  
  // Validar type
  if (!isValidHourBankType(doc.type)) {
    throw new Error(`Type inválido para HourBankRecord: ${doc.type}`);
  }
  
  // Validar status
  if (doc.status && !isValidHourBankStatus(doc.status)) {
    logger.warn(`Status inválido para HourBankRecord, usando 'pending'`, { status: doc.status });
    doc.status = 'pending';
  }
  
  // Validar formato de data
  if (!isValidDateFormat(doc.date)) {
    throw new Error(`Data inválida para HourBankRecord: ${doc.date}`);
  }
  
  return {
    id: uuid,
    employeeId: employeeId,
    date: doc.date,
    type: doc.type,
    hours: doc.hours || 0,
    reason: doc.reason || '',
    overtimeRecordId: doc.overtimeRecordId 
      ? convertObjectId(mapping, 'overtimes', doc.overtimeRecordId) 
      : null,
    status: doc.status || 'pending',
    createdBy: convertObjectId(mapping, 'users', doc.createdBy) || null,
    approvedBy: doc.approvedBy ? convertObjectId(mapping, 'users', doc.approvedBy) : null,
    rejectedBy: doc.rejectedBy ? convertObjectId(mapping, 'users', doc.rejectedBy) : null,
    approvedAt: doc.approvedAt ? convertDate(doc.approvedAt) : null,
    rejectedAt: doc.rejectedAt ? convertDate(doc.rejectedAt) : null,
    createdAt: convertDate(doc.createdAt) || new Date().toISOString(),
    updatedAt: convertDate(doc.updatedAt) || new Date().toISOString()
  };
}

/**
 * Transforma documento AuditLog
 */
function transformAuditLog(doc, mapping) {
  const objectId = doc._id;
  const uuid = convertObjectId(mapping, 'auditlogs', objectId);
  
  if (!uuid) {
    throw new Error(`Não foi possível mapear ObjectId para AuditLog: ${objectId}`);
  }
  
  // Validar action
  if (!isValidAuditAction(doc.action)) {
    throw new Error(`Action inválido para AuditLog: ${doc.action}`);
  }
  
  // Validar entityType
  if (!isValidEntityType(doc.entityType)) {
    throw new Error(`EntityType inválido para AuditLog: ${doc.entityType}`);
  }
  
  // Converter userId
  const userId = convertObjectId(mapping, 'users', doc.userId);
  if (!userId) {
    throw new Error(`userId inválido para AuditLog: ${doc.userId}`);
  }
  
  // Converter entityId (pode ser ObjectId de outra coleção)
  let entityId = doc.entityId;
  if (entityId) {
    // Tentar converter se for ObjectId válido
    const converted = convertObjectId(mapping, doc.entityType === 'employee' ? 'users' : 
      doc.entityType === 'overtime' ? 'overtimes' :
      doc.entityType === 'hourbank' ? 'hourbankrecords' : 'companysettings', entityId);
    if (converted) {
      entityId = converted;
    } else {
      // Se não conseguir converter, manter como string
      entityId = String(entityId);
    }
  }
  
  return {
    id: uuid,
    action: doc.action,
    entityType: doc.entityType,
    entityId: entityId || '',
    userId: userId,
    targetUserId: doc.targetUserId 
      ? convertObjectId(mapping, 'users', doc.targetUserId) 
      : null,
    description: doc.description || '',
    metadata: doc.metadata || {},
    ipAddress: doc.ipAddress || null,
    userAgent: doc.userAgent || null,
    createdAt: convertDate(doc.createdAt) || new Date().toISOString(),
    updatedAt: convertDate(doc.updatedAt) || new Date().toISOString()
  };
}

/**
 * Transforma documento CompanySettings
 */
function transformCompanySettings(doc, mapping) {
  const objectId = doc._id;
  const uuid = convertObjectId(mapping, 'companysettings', objectId);
  
  if (!uuid) {
    throw new Error(`Não foi possível mapear ObjectId para CompanySettings: ${objectId}`);
  }
  
  // Converter logo (Buffer para Base64)
  let logo = null;
  let logoContentType = null;
  
  if (doc.logo) {
    if (typeof doc.logo === 'object') {
      logo = convertBuffer(doc.logo);
      logoContentType = doc.logo.contentType || doc.logoContentType || null;
    } else if (Buffer.isBuffer(doc.logo)) {
      logo = convertBuffer(doc.logo);
      logoContentType = doc.logoContentType || null;
    }
  }
  
  return {
    id: uuid,
    name: doc.name || '',
    logo: logo, // Será convertido para Buffer no import
    logoContentType: logoContentType,
    reportHeader: doc.reportHeader || '',
    reportFooter: doc.reportFooter || '',
    managerEmail: doc.managerEmail || null,
    defaultOvertimeLimit: doc.defaultOvertimeLimit || 40,
    defaultAccumulationLimit: doc.defaultAccumulationLimit || 0,
    defaultUsageLimit: doc.defaultUsageLimit || 0,
    createdAt: convertDate(doc.createdAt) || new Date().toISOString(),
    updatedAt: convertDate(doc.updatedAt) || new Date().toISOString()
  };
}

/**
 * Transforma uma coleção de documentos
 */
async function transformCollection(collectionName, filename, mapping) {
  const filepath = join(DATA_DIR, filename);
  
  try {
    const content = await readFile(filepath, 'utf-8');
    const documents = JSON.parse(content);
    
    logger.info(`Transformando ${collectionName}...`, { count: documents.length });
    
    const transformed = [];
    const errors = [];
    
    for (let i = 0; i < documents.length; i++) {
      try {
        let transformedDoc;
        
        switch (collectionName) {
          case 'users':
            transformedDoc = transformUser(documents[i], mapping);
            break;
          case 'overtimes':
            transformedDoc = transformOvertime(documents[i], mapping);
            break;
          case 'hourbankrecords':
            transformedDoc = transformHourBankRecord(documents[i], mapping);
            break;
          case 'auditlogs':
            transformedDoc = transformAuditLog(documents[i], mapping);
            break;
          case 'companysettings':
            transformedDoc = transformCompanySettings(documents[i], mapping);
            break;
          default:
            throw new Error(`Coleção desconhecida: ${collectionName}`);
        }
        
        transformed.push(transformedDoc);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          doc: documents[i]
        });
        logger.warn(`Erro ao transformar documento ${i} de ${collectionName}`, { 
          error: error.message 
        });
      }
    }
    
    // Salvar dados transformados
    const outputFile = join(TRANSFORMED_DIR, filename);
    await writeFile(outputFile, JSON.stringify(transformed, null, 2), 'utf-8');
    
    logger.info(`Transformação de ${collectionName} concluída`, {
      total: documents.length,
      transformed: transformed.length,
      errors: errors.length
    });
    
    if (errors.length > 0) {
      logger.warn(`Erros na transformação de ${collectionName}`, { errors });
    }
    
    return { transformed, errors };
  } catch (error) {
    logger.logError(error, { context: `Erro ao transformar ${collectionName}` });
    throw error;
  }
}

/**
 * Função principal de transformação
 */
async function transformData() {
  try {
    // Criar diretório de dados transformados
    await mkdir(TRANSFORMED_DIR, { recursive: true });
    
    // Carregar mapeamento de IDs
    const mapping = await loadIdMapping();
    if (!mapping) {
      throw new Error('Mapeamento de IDs não encontrado. Execute id-mapping.js primeiro.');
    }
    
    logger.info('Iniciando transformação de dados...');
    
    const collections = {
      users: 'users.json',
      overtimes: 'overtimes.json',
      hourbankrecords: 'hourbankrecords.json',
      auditlogs: 'auditlogs.json',
      companysettings: 'companysettings.json'
    };
    
    const results = {};
    
    // Transformar cada coleção
    for (const [collectionName, filename] of Object.entries(collections)) {
      try {
        const result = await transformCollection(collectionName, filename, mapping);
        results[collectionName] = result;
      } catch (error) {
        logger.logError(error, { context: `Erro ao transformar ${collectionName}` });
        // Continuar com outras coleções
      }
    }
    
    logger.info('Transformação concluída!', { results });
    
    return results;
  } catch (error) {
    logger.logError(error, { context: 'Transformação de dados' });
    throw error;
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('transform-data.js')) {
  transformData()
    .then(() => {
      logger.info('✅ Transformação finalizada com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      logger.logError(error, { context: 'Erro fatal na transformação' });
      process.exit(1);
    });
}

export default transformData;

