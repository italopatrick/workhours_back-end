/**
 * Script de migração de dados: converte workSchedule (JSON) para tabela work_schedules normalizada
 * 
 * Este script:
 * 1. Lê todos os usuários com workSchedule não nulo
 * 2. Converte o JSON para registros na tabela work_schedules
 * 3. Valida os dados antes de inserir
 * 
 * Uso: node scripts/migrate-work-schedules.js
 */

import prisma from '../src/config/database.js';
import { convertWorkScheduleObjectToArray } from '../src/models/workSchedule.model.js';
import logger from '../src/utils/logger.js';

async function migrateWorkSchedules() {
  try {
    logger.info('Iniciando migração de jornadas de trabalho...');

    // Buscar todos os usuários com workSchedule não nulo
    const users = await prisma.user.findMany({
      where: {
        workSchedule: {
          not: null
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        workSchedule: true
      }
    });

    logger.info(`Encontrados ${users.length} usuários com jornada configurada`);

    let migrated = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Verificar se já existe jornada na nova tabela
        const existingSchedules = await prisma.workSchedule.findMany({
          where: { employeeId: user.id }
        });

        if (existingSchedules.length > 0) {
          logger.info(`Usuário ${user.name} (${user.id}) já tem jornada na nova tabela, pulando...`);
          continue;
        }

        // Converter JSON para array
        const schedulesArray = convertWorkScheduleObjectToArray(user.workSchedule);

        if (schedulesArray.length === 0) {
          logger.warn(`Usuário ${user.name} (${user.id}) tem workSchedule mas nenhum dia válido, pulando...`);
          continue;
        }

        // Criar registros na nova tabela
        for (const schedule of schedulesArray) {
          await prisma.workSchedule.create({
            data: {
              employeeId: user.id,
              dayOfWeek: schedule.dayOfWeek,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              isActive: schedule.isActive
            }
          });
        }

        logger.info(`Jornada migrada para ${user.name}: ${schedulesArray.length} dias`);
        migrated++;

      } catch (error) {
        logger.logError(error, {
          context: 'Erro ao migrar jornada',
          userId: user.id,
          userName: user.name
        });
        errors++;
      }
    }

    logger.info('Migração concluída', {
      total: users.length,
      migrated,
      errors,
      skipped: users.length - migrated - errors
    });

  } catch (error) {
    logger.logError(error, { context: 'Erro na migração de jornadas' });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar migração
migrateWorkSchedules()
  .then(() => {
    logger.info('Migração finalizada com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    logger.logError(error, { context: 'Falha na migração' });
    process.exit(1);
  });

