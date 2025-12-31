import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { getScheduledHoursForDay } from '../utils/timeClockUtils.js';

/**
 * Job diário para criar registros automáticos de ponto com horas negativas
 * para funcionários que não registraram ponto no dia
 * 
 * Este job deve ser executado diariamente (ex: às 23:59 ou 00:01)
 */
export async function createDailyTimeClockRecords() {
  try {
    // Processar o dia anterior (ontem) para garantir que a jornada já terminou
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDate = yesterday.toISOString().split('T')[0];
    logger.info('Iniciando job diário de criação de registros de ponto automáticos', { date: targetDate });
    
    // Buscar todos os funcionários (independente da role)
    const employees = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        workSchedule: true, // Manter para backward compatibility
        workSchedules: {
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            isActive: true
          },
          orderBy: {
            dayOfWeek: 'asc'
          }
        },
        lunchBreakHours: true,
        requiresTimeClock: true
      }
    });
    
    logger.info('Funcionários encontrados', { count: employees.length });
    
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const employee of employees) {
      try {
        // Verificar se funcionário precisa bater ponto
        if (!employee.requiresTimeClock) {
          skippedCount++;
          continue;
        }
        
        // Verificar se já existe registro para o dia alvo (ontem)
        const existingRecord = await prisma.timeClock.findFirst({
          where: {
            employeeId: employee.id,
            date: targetDate
          }
        });
        
        // Se já existe registro com entrada ou saída, pular
        if (existingRecord && (existingRecord.entryTime || existingRecord.exitTime)) {
          skippedCount++;
          continue;
        }
        
        // Calcular horas agendadas para o dia alvo (ontem) usando função utilitária
        const targetDateObj = new Date(targetDate);
        const scheduledHours = getScheduledHoursForDay(employee, targetDateObj);
        
        // Se não há horário agendado para o dia (ex: fim de semana ou dia não configurado na escala), pular
        if (scheduledHours === 0) {
          skippedCount++;
          continue;
        }
        
        // Se já existe registro automático (sem entryTime e exitTime), atualizar
        if (existingRecord && !existingRecord.entryTime && !existingRecord.exitTime) {
          await prisma.timeClock.update({
            where: { id: existingRecord.id },
            data: {
              scheduledHours,
              negativeHours: scheduledHours // Horas negativas = horas agendadas (não trabalhou)
            }
          });
          updatedCount++;
          logger.debug('Registro automático atualizado', { 
            employeeId: employee.id, 
            employeeName: employee.name,
            scheduledHours,
            negativeHours: scheduledHours
          });
        } else if (!existingRecord) {
          // Criar novo registro automático
          await prisma.timeClock.create({
            data: {
              employeeId: employee.id,
              date: targetDate,
              scheduledHours,
              negativeHours: scheduledHours // Horas negativas = horas agendadas (não trabalhou)
            }
          });
          createdCount++;
          logger.debug('Registro automático criado', { 
            employeeId: employee.id, 
            employeeName: employee.name,
            scheduledHours,
            negativeHours: scheduledHours
          });
        }
      } catch (error) {
        logger.logError(error, { 
          context: 'Erro ao processar funcionário no job diário',
          employeeId: employee.id,
          employeeName: employee.name
        });
      }
    }
    
    logger.info('Job diário de criação de registros de ponto concluído', {
      date: targetDate,
      totalEmployees: employees.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount
    });
    
    return {
      success: true,
      date: targetDate,
      totalEmployees: employees.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount
    };
  } catch (error) {
    logger.logError(error, { context: 'Erro no job diário de criação de registros de ponto' });
    throw error;
  }
}

export default {
  createDailyTimeClockRecords
};

