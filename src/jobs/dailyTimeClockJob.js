import prisma from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Job diário para criar registros automáticos de ponto com horas negativas
 * para funcionários que não registraram ponto no dia
 * 
 * Este job deve ser executado diariamente (ex: às 23:59 ou 00:01)
 */
export async function createDailyTimeClockRecords() {
  try {
    const today = new Date().toISOString().split('T')[0];
    logger.info('Iniciando job diário de criação de registros de ponto automáticos', { date: today });
    
    // Buscar todos os funcionários ativos (não admin)
    const employees = await prisma.user.findMany({
      where: {
        role: { not: 'admin' }
      },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        workSchedule: true,
        lunchBreakHours: true
      }
    });
    
    logger.info('Funcionários encontrados', { count: employees.length });
    
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const employee of employees) {
      try {
        // Verificar se já existe registro para hoje
        const existingRecord = await prisma.timeClock.findFirst({
          where: {
            employeeId: employee.id,
            date: today
          }
        });
        
        // Se já existe registro com entrada ou saída, pular
        if (existingRecord && (existingRecord.entryTime || existingRecord.exitTime)) {
          skippedCount++;
          continue;
        }
        
        // Calcular horas agendadas para hoje
        const scheduledHours = employee.workSchedule 
          ? calculateScheduledHours(employee.workSchedule, today, employee.lunchBreakHours || 0)
          : 0;
        
        // Se não há horário agendado para hoje (ex: fim de semana), pular
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
              date: today,
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
      date: today,
      totalEmployees: employees.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount
    });
    
    return {
      success: true,
      date: today,
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

/**
 * Helper: Calcular horas agendadas
 */
function calculateScheduledHours(workSchedule, date, lunchBreakHours = 0) {
  if (!workSchedule) return 0;
  
  const dayOfWeek = new Date(date).getDay(); // 0 = domingo, 1 = segunda, etc.
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];
  
  const schedule = workSchedule[dayName];
  if (!schedule || !schedule.startTime || !schedule.endTime) return 0;
  
  const start = new Date(`${date}T${schedule.startTime}`);
  const end = new Date(`${date}T${schedule.endTime}`);
  const totalHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  
  return Math.max(0, totalHours - lunchBreakHours);
}

export default {
  createDailyTimeClockRecords
};

