#!/usr/bin/env node

import exportMongoDB from './export-mongodb.js';
import createIdMapping from './id-mapping.js';
import transformData from './transform-data.js';
import importPostgreSQL from './import-postgresql.js';
import validateMigration from './validate-migration.js';
import logger from '../../src/utils/logger.js';

/**
 * Parse argumentos da linha de comando
 */
function parseArgs() {
  const args = {
    dryRun: false,
    skipExport: false,
    skipValidation: false,
    collection: null
  };
  
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--skip-export') {
      args.skipExport = true;
    } else if (arg === '--skip-validation') {
      args.skipValidation = true;
    } else if (arg === '--collection' && i + 1 < process.argv.length) {
      args.collection = process.argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  
  return args;
}

/**
 * Imprime ajuda
 */
function printHelp() {
  console.log(`
Uso: node scripts/migrate/migrate-data.js [opções]

Opções:
  --dry-run              Simular migração sem inserir dados
  --skip-export          Pular exportação (usar dados existentes)
  --skip-validation      Pular validação final
  --collection <nome>    Migrar apenas uma coleção específica
  --help, -h             Mostrar esta ajuda

Exemplos:
  # Migração completa
  node scripts/migrate/migrate-data.js

  # Simular migração
  node scripts/migrate/migrate-data.js --dry-run

  # Usar dados já exportados
  node scripts/migrate/migrate-data.js --skip-export

  # Migrar apenas usuários
  node scripts/migrate/migrate-data.js --collection users
`);
}

/**
 * Função principal de migração
 */
async function migrateData() {
  const args = parseArgs();
  
  logger.info('🚀 Iniciando migração de dados MongoDB → PostgreSQL', { args });
  
  const startTime = Date.now();
  const results = {
    export: null,
    idMapping: null,
    transform: null,
    import: null,
    validation: null,
    errors: []
  };
  
  try {
    // 1. Exportar do MongoDB
    if (!args.skipExport) {
      logger.info('📤 Etapa 1/5: Exportando dados do MongoDB...');
      try {
        results.export = await exportMongoDB();
        logger.info('✅ Exportação concluída', { results: results.export });
      } catch (error) {
        logger.logError(error, { context: 'Exportação MongoDB' });
        results.errors.push({ step: 'export', error: error.message });
        throw error;
      }
    } else {
      logger.info('⏭️  Pulando exportação (usando dados existentes)');
    }
    
    // 2. Criar mapeamento de IDs
    logger.info('🔄 Etapa 2/5: Criando mapeamento de ObjectIds para UUIDs...');
    try {
      results.idMapping = await createIdMapping();
      logger.info('✅ Mapeamento de IDs criado');
    } catch (error) {
      logger.logError(error, { context: 'Mapeamento de IDs' });
      results.errors.push({ step: 'idMapping', error: error.message });
      throw error;
    }
    
    // 3. Transformar dados
    logger.info('🔄 Etapa 3/5: Transformando dados...');
    try {
      results.transform = await transformData();
      logger.info('✅ Transformação concluída', { results: results.transform });
    } catch (error) {
      logger.logError(error, { context: 'Transformação de dados' });
      results.errors.push({ step: 'transform', error: error.message });
      throw error;
    }
    
    // 4. Importar no PostgreSQL
    logger.info('📥 Etapa 4/5: Importando dados no PostgreSQL...');
    try {
      results.import = await importPostgreSQL(args.dryRun);
      logger.info('✅ Importação concluída', { results: results.import });
    } catch (error) {
      logger.logError(error, { context: 'Importação PostgreSQL' });
      results.errors.push({ step: 'import', error: error.message });
      throw error;
    }
    
    // 5. Validar migração
    if (!args.skipValidation && !args.dryRun) {
      logger.info('✅ Etapa 5/5: Validando migração...');
      try {
        results.validation = await validateMigration();
        
        if (results.validation.summary.valid) {
          logger.info('✅ Validação passou com sucesso!');
        } else {
          logger.warn('⚠️  Validação encontrou problemas', {
            issues: results.validation.summary.issues
          });
          results.errors.push({
            step: 'validation',
            error: 'Problemas encontrados na validação',
            issues: results.validation.summary.issues
          });
        }
      } catch (error) {
        logger.logError(error, { context: 'Validação' });
        results.errors.push({ step: 'validation', error: error.message });
        // Não falhar completamente se validação falhar
      }
    } else {
      logger.info('⏭️  Pulando validação');
    }
    
    // Resumo final
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (results.errors.length === 0) {
      logger.info('🎉 Migração concluída com sucesso!', {
        duration: `${duration}s`,
        dryRun: args.dryRun
      });
    } else {
      logger.warn('⚠️  Migração concluída com erros', {
        duration: `${duration}s`,
        errors: results.errors
      });
    }
    
    return results;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.logError(error, {
      context: 'Erro fatal na migração',
      duration: `${duration}s`
    });
    
    results.errors.push({ step: 'fatal', error: error.message });
    throw error;
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate-data.js')) {
  migrateData()
    .then((results) => {
      if (results.errors.length === 0) {
        process.exit(0);
      } else {
        logger.warn('Migração concluída com erros');
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.logError(error, { context: 'Erro fatal' });
      process.exit(1);
    });
}

export default migrateData;

