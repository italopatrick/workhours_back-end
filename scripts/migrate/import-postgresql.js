import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connectPostgreSQL, disconnectPostgreSQL, getPrismaClient } from './utils/prisma-connection.js';
import logger from '../../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TRANSFORMED_DIR = join(__dirname, 'transformed');

// Ordem de importação (respeitando foreign keys)
const IMPORT_ORDER = [
  { collection: 'users', file: 'users.json' },
  { collection: 'companysettings', file: 'companysettings.json' },
  { collection: 'overtimes', file: 'overtimes.json' },
  { collection: 'hourbankrecords', file: 'hourbankrecords.json' },
  { collection: 'auditlogs', file: 'auditlogs.json' }
];

/**
 * Carrega dados transformados de um arquivo
 * @param {string} filename
 * @returns {Promise<Array>}
 */
async function loadTransformedData(filename) {
  const filepath = join(TRANSFORMED_DIR, filename);
  try {
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
 * Converte Base64 string para Buffer
 * @param {string} base64
 * @returns {Buffer|null}
 */
function base64ToBuffer(base64) {
  if (!base64) return null;
  try {
    return Buffer.from(base64, 'base64');
  } catch (error) {
    logger.warn('Erro ao converter Base64 para Buffer', { error: error.message });
    return null;
  }
}

/**
 * Importa usuários
 */
async function importUsers(prisma, data, dryRun = false) {
  logger.info(`Importando ${data.length} usuários...`);
  
  if (dryRun) {
    logger.info('[DRY RUN] Simulando importação de usuários');
    return { imported: data.length, errors: [] };
  }
  
  const errors = [];
  let imported = 0;
  
  // Importar em lotes para melhor performance
  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    try {
      await prisma.$transaction(
        batch.map(user => 
          prisma.user.upsert({
            where: { id: user.id },
            update: {
              email: user.email,
              password: user.password,
              role: user.role,
              name: user.name,
              department: user.department,
              externalId: user.externalId,
              externalAuth: user.externalAuth,
              overtimeLimit: user.overtimeLimit,
              overtimeExceptions: user.overtimeExceptions,
              updatedAt: new Date(user.updatedAt)
            },
            create: {
              id: user.id,
              email: user.email,
              password: user.password,
              role: user.role,
              name: user.name,
              department: user.department,
              externalId: user.externalId,
              externalAuth: user.externalAuth,
              overtimeLimit: user.overtimeLimit,
              overtimeExceptions: user.overtimeExceptions,
              createdAt: new Date(user.createdAt),
              updatedAt: new Date(user.updatedAt)
            }
          })
        )
      );
      imported += batch.length;
      logger.info(`Importados ${imported}/${data.length} usuários`);
    } catch (error) {
      logger.logError(error, { context: `Erro ao importar lote de usuários (${i}-${i + batch.length})` });
      errors.push({ batch: i, error: error.message });
    }
  }
  
  return { imported, errors };
}

/**
 * Importa configurações da empresa
 */
async function importCompanySettings(prisma, data, dryRun = false) {
  logger.info(`Importando ${data.length} configurações da empresa...`);
  
  if (dryRun) {
    logger.info('[DRY RUN] Simulando importação de configurações');
    return { imported: data.length, errors: [] };
  }
  
  const errors = [];
  let imported = 0;
  
  for (const settings of data) {
    try {
      const logoBuffer = settings.logo ? base64ToBuffer(settings.logo) : null;
      
      await prisma.companySettings.upsert({
        where: { id: settings.id },
        update: {
          name: settings.name,
          logo: logoBuffer,
          logoContentType: settings.logoContentType,
          reportHeader: settings.reportHeader,
          reportFooter: settings.reportFooter,
          managerEmail: settings.managerEmail,
          defaultOvertimeLimit: settings.defaultOvertimeLimit,
          defaultAccumulationLimit: settings.defaultAccumulationLimit,
          defaultUsageLimit: settings.defaultUsageLimit,
          updatedAt: new Date(settings.updatedAt)
        },
        create: {
          id: settings.id,
          name: settings.name,
          logo: logoBuffer,
          logoContentType: settings.logoContentType,
          reportHeader: settings.reportHeader,
          reportFooter: settings.reportFooter,
          managerEmail: settings.managerEmail,
          defaultOvertimeLimit: settings.defaultOvertimeLimit,
          defaultAccumulationLimit: settings.defaultAccumulationLimit,
          defaultUsageLimit: settings.defaultUsageLimit,
          createdAt: new Date(settings.createdAt),
          updatedAt: new Date(settings.updatedAt)
        }
      });
      imported++;
    } catch (error) {
      logger.logError(error, { context: `Erro ao importar CompanySettings ${settings.id}` });
      errors.push({ id: settings.id, error: error.message });
    }
  }
  
  return { imported, errors };
}

/**
 * Importa overtimes
 */
async function importOvertimes(prisma, data, dryRun = false) {
  logger.info(`Importando ${data.length} overtimes...`);
  
  if (dryRun) {
    logger.info('[DRY RUN] Simulando importação de overtimes');
    return { imported: data.length, errors: [] };
  }
  
  const errors = [];
  let imported = 0;
  
  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    try {
      await prisma.$transaction(
        batch.map(overtime =>
          prisma.overtime.upsert({
            where: { id: overtime.id },
            update: {
              employeeId: overtime.employeeId,
              date: overtime.date,
              startTime: overtime.startTime,
              endTime: overtime.endTime,
              hours: overtime.hours,
              reason: overtime.reason,
              status: overtime.status,
              createdBy: overtime.createdBy,
              approvedBy: overtime.approvedBy,
              rejectedBy: overtime.rejectedBy,
              approvedAt: overtime.approvedAt ? new Date(overtime.approvedAt) : null,
              rejectedAt: overtime.rejectedAt ? new Date(overtime.rejectedAt) : null,
              updatedAt: new Date(overtime.updatedAt)
            },
            create: {
              id: overtime.id,
              employeeId: overtime.employeeId,
              date: overtime.date,
              startTime: overtime.startTime,
              endTime: overtime.endTime,
              hours: overtime.hours,
              reason: overtime.reason,
              status: overtime.status,
              createdBy: overtime.createdBy,
              approvedBy: overtime.approvedBy,
              rejectedBy: overtime.rejectedBy,
              approvedAt: overtime.approvedAt ? new Date(overtime.approvedAt) : null,
              rejectedAt: overtime.rejectedAt ? new Date(overtime.rejectedAt) : null,
              createdAt: new Date(overtime.createdAt),
              updatedAt: new Date(overtime.updatedAt)
            }
          })
        )
      );
      imported += batch.length;
      logger.info(`Importados ${imported}/${data.length} overtimes`);
    } catch (error) {
      logger.logError(error, { context: `Erro ao importar lote de overtimes (${i}-${i + batch.length})` });
      errors.push({ batch: i, error: error.message });
    }
  }
  
  return { imported, errors };
}

/**
 * Importa registros do banco de horas
 */
async function importHourBankRecords(prisma, data, dryRun = false) {
  logger.info(`Importando ${data.length} registros do banco de horas...`);
  
  if (dryRun) {
    logger.info('[DRY RUN] Simulando importação de registros do banco de horas');
    return { imported: data.length, errors: [] };
  }
  
  const errors = [];
  let imported = 0;
  
  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    try {
      await prisma.$transaction(
        batch.map(record =>
          prisma.hourBankRecord.upsert({
            where: { id: record.id },
            update: {
              employeeId: record.employeeId,
              date: record.date,
              type: record.type,
              hours: record.hours,
              reason: record.reason,
              overtimeRecordId: record.overtimeRecordId,
              status: record.status,
              createdBy: record.createdBy,
              approvedBy: record.approvedBy,
              rejectedBy: record.rejectedBy,
              approvedAt: record.approvedAt ? new Date(record.approvedAt) : null,
              rejectedAt: record.rejectedAt ? new Date(record.rejectedAt) : null,
              updatedAt: new Date(record.updatedAt)
            },
            create: {
              id: record.id,
              employeeId: record.employeeId,
              date: record.date,
              type: record.type,
              hours: record.hours,
              reason: record.reason,
              overtimeRecordId: record.overtimeRecordId,
              status: record.status,
              createdBy: record.createdBy,
              approvedBy: record.approvedBy,
              rejectedBy: record.rejectedBy,
              approvedAt: record.approvedAt ? new Date(record.approvedAt) : null,
              rejectedAt: record.rejectedAt ? new Date(record.rejectedAt) : null,
              createdAt: new Date(record.createdAt),
              updatedAt: new Date(record.updatedAt)
            }
          })
        )
      );
      imported += batch.length;
      logger.info(`Importados ${imported}/${data.length} registros do banco de horas`);
    } catch (error) {
      logger.logError(error, { context: `Erro ao importar lote de registros (${i}-${i + batch.length})` });
      errors.push({ batch: i, error: error.message });
    }
  }
  
  return { imported, errors };
}

/**
 * Importa logs de auditoria
 */
async function importAuditLogs(prisma, data, dryRun = false) {
  logger.info(`Importando ${data.length} logs de auditoria...`);
  
  if (dryRun) {
    logger.info('[DRY RUN] Simulando importação de logs de auditoria');
    return { imported: data.length, errors: [] };
  }
  
  const errors = [];
  let imported = 0;
  
  const batchSize = 500; // Audit logs podem ser muitos, usar lote maior
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    try {
      await prisma.$transaction(
        batch.map(log =>
          prisma.auditLog.create({
            data: {
              id: log.id,
              action: log.action,
              entityType: log.entityType,
              entityId: log.entityId,
              userId: log.userId,
              targetUserId: log.targetUserId,
              description: log.description,
              metadata: log.metadata,
              ipAddress: log.ipAddress,
              userAgent: log.userAgent,
              createdAt: new Date(log.createdAt),
              updatedAt: new Date(log.updatedAt)
            }
          })
        )
      );
      imported += batch.length;
      logger.info(`Importados ${imported}/${data.length} logs de auditoria`);
    } catch (error) {
      logger.logError(error, { context: `Erro ao importar lote de logs (${i}-${i + batch.length})` });
      errors.push({ batch: i, error: error.message });
    }
  }
  
  return { imported, errors };
}

/**
 * Função principal de importação
 */
async function importPostgreSQL(dryRun = false) {
  let prisma = null;
  
  try {
    // Conectar ao PostgreSQL
    prisma = await connectPostgreSQL();
    
    logger.info('Iniciando importação para PostgreSQL...', { dryRun });
    
    const results = {};
    
    // Importar na ordem correta
    for (const { collection, file } of IMPORT_ORDER) {
      try {
        const data = await loadTransformedData(file);
        
        if (data.length === 0) {
          logger.info(`Nenhum dado para importar de ${collection}`);
          results[collection] = { imported: 0, errors: [] };
          continue;
        }
        
        let result;
        switch (collection) {
          case 'users':
            result = await importUsers(prisma, data, dryRun);
            break;
          case 'companysettings':
            result = await importCompanySettings(prisma, data, dryRun);
            break;
          case 'overtimes':
            result = await importOvertimes(prisma, data, dryRun);
            break;
          case 'hourbankrecords':
            result = await importHourBankRecords(prisma, data, dryRun);
            break;
          case 'auditlogs':
            result = await importAuditLogs(prisma, data, dryRun);
            break;
          default:
            throw new Error(`Coleção desconhecida: ${collection}`);
        }
        
        results[collection] = result;
      } catch (error) {
        logger.logError(error, { context: `Erro ao importar ${collection}` });
        results[collection] = { imported: 0, errors: [{ error: error.message }] };
      }
    }
    
    logger.info('Importação concluída!', { results });
    
    return results;
  } catch (error) {
    logger.logError(error, { context: 'Importação PostgreSQL' });
    throw error;
  } finally {
    if (prisma) {
      await disconnectPostgreSQL();
    }
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('import-postgresql.js')) {
  const dryRun = process.argv.includes('--dry-run');
  
  importPostgreSQL(dryRun)
    .then(() => {
      logger.info('✅ Importação finalizada com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      logger.logError(error, { context: 'Erro fatal na importação' });
      process.exit(1);
    });
}

export default importPostgreSQL;

