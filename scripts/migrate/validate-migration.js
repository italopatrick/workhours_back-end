import { connectMongoDB, disconnectMongoDB, getCollection } from './utils/mongo-connection.js';
import { connectPostgreSQL, disconnectPostgreSQL, getPrismaClient } from './utils/prisma-connection.js';
import logger from '../../src/utils/logger.js';

/**
 * Conta documentos em uma coleção do MongoDB
 * @param {string} collectionName
 * @returns {Promise<number>}
 */
async function countMongoCollection(collectionName) {
  try {
    const collection = getCollection(collectionName);
    return await collection.countDocuments({});
  } catch (error) {
    logger.logError(error, { context: `Contar ${collectionName} no MongoDB` });
    return 0;
  }
}

/**
 * Conta registros em uma tabela do PostgreSQL
 * @param {string} tableName
 * @param {PrismaClient} prisma
 * @returns {Promise<number>}
 */
async function countPostgresTable(tableName, prisma) {
  try {
    switch (tableName) {
      case 'users':
        return await prisma.user.count();
      case 'overtimes':
        return await prisma.overtime.count();
      case 'hourbankrecords':
        return await prisma.hourBankRecord.count();
      case 'auditlogs':
        return await prisma.auditLog.count();
      case 'companysettings':
        return await prisma.companySettings.count();
      default:
        throw new Error(`Tabela desconhecida: ${tableName}`);
    }
  } catch (error) {
    logger.logError(error, { context: `Contar ${tableName} no PostgreSQL` });
    return 0;
  }
}

/**
 * Valida integridade referencial
 * @param {PrismaClient} prisma
 * @returns {Promise<Object>}
 */
async function validateReferentialIntegrity(prisma) {
  const issues = [];
  
  try {
    // Validar overtimes com employeeId inválido
    const invalidOvertimes = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM overtimes o
      LEFT JOIN users u ON o."employeeId" = u.id
      WHERE u.id IS NULL
    `;
    
    if (invalidOvertimes[0]?.count > 0) {
      issues.push({
        type: 'foreign_key',
        table: 'overtimes',
        field: 'employeeId',
        count: Number(invalidOvertimes[0].count),
        message: 'Overtimes com employeeId inválido'
      });
    }
    
    // Validar hourbankrecords com employeeId inválido
    const invalidHourBank = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM hour_bank_records h
      LEFT JOIN users u ON h."employeeId" = u.id
      WHERE u.id IS NULL
    `;
    
    if (invalidHourBank[0]?.count > 0) {
      issues.push({
        type: 'foreign_key',
        table: 'hour_bank_records',
        field: 'employeeId',
        count: Number(invalidHourBank[0].count),
        message: 'HourBankRecords com employeeId inválido'
      });
    }
    
    // Validar auditlogs com userId inválido
    const invalidAuditLogs = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM audit_logs a
      LEFT JOIN users u ON a."userId" = u.id
      WHERE u.id IS NULL
    `;
    
    if (invalidAuditLogs[0]?.count > 0) {
      issues.push({
        type: 'foreign_key',
        table: 'audit_logs',
        field: 'userId',
        count: Number(invalidAuditLogs[0].count),
        message: 'AuditLogs com userId inválido'
      });
    }
    
    // Validar hourbankrecords com overtimeRecordId inválido
    const invalidOvertimeRefs = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM hour_bank_records h
      WHERE h."overtimeRecordId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM overtimes o WHERE o.id = h."overtimeRecordId"
      )
    `;
    
    if (invalidOvertimeRefs[0]?.count > 0) {
      issues.push({
        type: 'foreign_key',
        table: 'hour_bank_records',
        field: 'overtimeRecordId',
        count: Number(invalidOvertimeRefs[0].count),
        message: 'HourBankRecords com overtimeRecordId inválido'
      });
    }
    
  } catch (error) {
    logger.logError(error, { context: 'Validação de integridade referencial' });
    issues.push({
      type: 'error',
      message: `Erro ao validar integridade: ${error.message}`
    });
  }
  
  return { valid: issues.length === 0, issues };
}

/**
 * Valida unicidade de campos únicos
 * @param {PrismaClient} prisma
 * @returns {Promise<Object>}
 */
async function validateUniqueness(prisma) {
  const issues = [];
  
  try {
    // Validar emails únicos
    const duplicateEmails = await prisma.$queryRaw`
      SELECT email, COUNT(*) as count
      FROM users
      GROUP BY email
      HAVING COUNT(*) > 1
    `;
    
    if (duplicateEmails.length > 0) {
      issues.push({
        type: 'uniqueness',
        table: 'users',
        field: 'email',
        duplicates: duplicateEmails,
        message: 'Emails duplicados encontrados'
      });
    }
    
    // Validar externalIds únicos (não nulos)
    const duplicateExternalIds = await prisma.$queryRaw`
      SELECT "externalId", COUNT(*) as count
      FROM users
      WHERE "externalId" IS NOT NULL
      GROUP BY "externalId"
      HAVING COUNT(*) > 1
    `;
    
    if (duplicateExternalIds.length > 0) {
      issues.push({
        type: 'uniqueness',
        table: 'users',
        field: 'externalId',
        duplicates: duplicateExternalIds,
        message: 'ExternalIds duplicados encontrados'
      });
    }
    
  } catch (error) {
    logger.logError(error, { context: 'Validação de unicidade' });
    issues.push({
      type: 'error',
      message: `Erro ao validar unicidade: ${error.message}`
    });
  }
  
  return { valid: issues.length === 0, issues };
}

/**
 * Valida dados críticos
 * @param {PrismaClient} prisma
 * @returns {Promise<Object>}
 */
async function validateCriticalData(prisma) {
  const issues = [];
  
  try {
    // Validar usuários sem email (usando queryRaw pois Prisma não permite null em campos obrigatórios)
    const usersWithoutEmailResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM users
      WHERE email IS NULL OR email = ''
    `;
    const usersWithoutEmail = Number(usersWithoutEmailResult[0]?.count || 0);
    
    if (usersWithoutEmail > 0) {
      issues.push({
        type: 'critical',
        table: 'users',
        field: 'email',
        count: usersWithoutEmail,
        message: 'Usuários sem email'
      });
    }
    
    // Validar overtimes com horas negativas ou zero (usando queryRaw pois hours não pode ser null)
    const invalidHoursResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM overtimes
      WHERE hours <= 0
    `;
    const invalidHours = Number(invalidHoursResult[0]?.count || 0);
    
    if (invalidHours > 0) {
      issues.push({
        type: 'critical',
        table: 'overtimes',
        field: 'hours',
        count: invalidHours,
        message: 'Overtimes com horas inválidas'
      });
    }
    
    // Validar overtimes sem employeeId (usando queryRaw pois employeeId não pode ser null)
    const overtimesWithoutEmployeeResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM overtimes
      WHERE "employeeId" IS NULL
    `;
    const overtimesWithoutEmployee = Number(overtimesWithoutEmployeeResult[0]?.count || 0);
    
    if (overtimesWithoutEmployee > 0) {
      issues.push({
        type: 'critical',
        table: 'overtimes',
        field: 'employeeId',
        count: overtimesWithoutEmployee,
        message: 'Overtimes sem employeeId'
      });
    }
    
  } catch (error) {
    logger.logError(error, { context: 'Validação de dados críticos' });
    issues.push({
      type: 'error',
      message: `Erro ao validar dados críticos: ${error.message}`
    });
  }
  
  return { valid: issues.length === 0, issues };
}

/**
 * Função principal de validação
 */
async function validateMigration() {
  let mongoConnection = null;
  let prisma = null;
  
  try {
    // Conectar aos bancos
    mongoConnection = await connectMongoDB();
    prisma = await connectPostgreSQL();
    
    logger.info('Iniciando validação da migração...');
    
    const results = {
      counts: {},
      referentialIntegrity: null,
      uniqueness: null,
      criticalData: null,
      summary: {
        valid: true,
        issues: []
      }
    };
    
    // Mapeamento de coleções MongoDB para tabelas PostgreSQL
    const collections = [
      { mongo: 'users', postgres: 'users' },
      { mongo: 'overtimes', postgres: 'overtimes' },
      { mongo: 'hourbankrecords', postgres: 'hourbankrecords' },
      { mongo: 'auditlogs', postgres: 'auditlogs' },
      { mongo: 'companysettings', postgres: 'companysettings' }
    ];
    
    // Comparar contagens
    logger.info('Comparando contagens de registros...');
    for (const { mongo, postgres } of collections) {
      const mongoCount = await countMongoCollection(mongo);
      const postgresCount = await countPostgresTable(postgres, prisma);
      
      results.counts[postgres] = {
        mongo: mongoCount,
        postgres: postgresCount,
        match: mongoCount === postgresCount,
        difference: postgresCount - mongoCount
      };
      
      if (mongoCount !== postgresCount) {
        results.summary.valid = false;
        results.summary.issues.push({
          type: 'count_mismatch',
          collection: postgres,
          mongo: mongoCount,
          postgres: postgresCount,
          difference: postgresCount - mongoCount
        });
      }
      
      logger.info(`${postgres}: MongoDB=${mongoCount}, PostgreSQL=${postgresCount}`, {
        match: mongoCount === postgresCount
      });
    }
    
    // Validar integridade referencial
    logger.info('Validando integridade referencial...');
    results.referentialIntegrity = await validateReferentialIntegrity(prisma);
    if (!results.referentialIntegrity.valid) {
      results.summary.valid = false;
      results.summary.issues.push(...results.referentialIntegrity.issues);
    }
    
    // Validar unicidade
    logger.info('Validando unicidade...');
    results.uniqueness = await validateUniqueness(prisma);
    if (!results.uniqueness.valid) {
      results.summary.valid = false;
      results.summary.issues.push(...results.uniqueness.issues);
    }
    
    // Validar dados críticos
    logger.info('Validando dados críticos...');
    results.criticalData = await validateCriticalData(prisma);
    if (!results.criticalData.valid) {
      results.summary.valid = false;
      results.summary.issues.push(...results.criticalData.issues);
    }
    
    // Resumo
    logger.info('Validação concluída!', {
      valid: results.summary.valid,
      totalIssues: results.summary.issues.length
    });
    
    if (!results.summary.valid) {
      logger.warn('Problemas encontrados na validação:', {
        issues: results.summary.issues
      });
    }
    
    return results;
  } catch (error) {
    logger.logError(error, { context: 'Validação da migração' });
    throw error;
  } finally {
    if (mongoConnection) {
      await disconnectMongoDB();
    }
    if (prisma) {
      await disconnectPostgreSQL();
    }
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validate-migration.js')) {
  validateMigration()
    .then((results) => {
      if (results.summary.valid) {
        logger.info('✅ Validação passou com sucesso!');
      } else {
        logger.warn('⚠️  Validação encontrou problemas');
      }
      process.exit(results.summary.valid ? 0 : 1);
    })
    .catch((error) => {
      logger.logError(error, { context: 'Erro fatal na validação' });
      process.exit(1);
    });
}

export default validateMigration;

