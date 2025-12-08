import prisma from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * WorkSchedule model helper functions using Prisma
 */

/**
 * Create or update work schedule for an employee
 * @param {string} employeeId - Employee ID
 * @param {Array} schedules - Array of schedule objects: [{ dayOfWeek: 'monday', startTime: '08:00', endTime: '18:00' }, ...]
 * @returns {Promise<Array>} Array of created/updated WorkSchedule records
 */
export async function createOrUpdateWorkSchedule(employeeId, schedules) {
  try {
    const results = [];
    
    for (const schedule of schedules) {
      const { dayOfWeek, startTime, endTime, isActive = true } = schedule;
      
      // Validar formato de horário (HH:mm)
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        throw new Error(`Formato de horário inválido para ${dayOfWeek}: ${startTime} - ${endTime}`);
      }
      
      // Validar que endTime > startTime
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      if (endMinutes <= startMinutes) {
        throw new Error(`Horário de término deve ser maior que horário de início para ${dayOfWeek}`);
      }
      
      // Validar dayOfWeek
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      if (!validDays.includes(dayOfWeek.toLowerCase())) {
        throw new Error(`Dia da semana inválido: ${dayOfWeek}`);
      }
      
      const result = await prisma.workSchedule.upsert({
        where: {
          employeeId_dayOfWeek: {
            employeeId,
            dayOfWeek: dayOfWeek.toLowerCase()
          }
        },
        update: {
          startTime,
          endTime,
          isActive
        },
        create: {
          employeeId,
          dayOfWeek: dayOfWeek.toLowerCase(),
          startTime,
          endTime,
          isActive
        }
      });
      
      results.push(result);
    }
    
    logger.info('Jornada de trabalho criada/atualizada', {
      employeeId,
      schedulesCount: results.length
    });
    
    return results;
  } catch (error) {
    logger.logError(error, { context: 'createOrUpdateWorkSchedule', employeeId });
    throw error;
  }
}

/**
 * Get work schedule for an employee
 * @param {string} employeeId - Employee ID
 * @param {boolean} activeOnly - Return only active schedules
 * @returns {Promise<Array>} Array of WorkSchedule records
 */
export async function getWorkScheduleByEmployee(employeeId, activeOnly = false) {
  const where = { employeeId };
  if (activeOnly) {
    where.isActive = true;
  }
  
  const schedules = await prisma.workSchedule.findMany({
    where,
    orderBy: {
      dayOfWeek: 'asc'
    }
  });
  
  return schedules;
}

/**
 * Get work schedule for a specific day
 * @param {string} employeeId - Employee ID
 * @param {string} dayOfWeek - Day of week ('monday', 'tuesday', etc.)
 * @returns {Promise<Object|null>} WorkSchedule record or null
 */
export async function getWorkScheduleForDay(employeeId, dayOfWeek) {
  const schedule = await prisma.workSchedule.findUnique({
    where: {
      employeeId_dayOfWeek: {
        employeeId,
        dayOfWeek: dayOfWeek.toLowerCase()
      }
    }
  });
  
  return schedule;
}

/**
 * Delete work schedule for an employee
 * @param {string} employeeId - Employee ID
 * @param {string|null} dayOfWeek - Day of week (optional, if null deletes all)
 * @returns {Promise<number>} Number of deleted records
 */
export async function deleteWorkSchedule(employeeId, dayOfWeek = null) {
  const where = { employeeId };
  if (dayOfWeek) {
    where.dayOfWeek = dayOfWeek.toLowerCase();
  }
  
  const result = await prisma.workSchedule.deleteMany({
    where
  });
  
  logger.info('Jornada de trabalho deletada', {
    employeeId,
    dayOfWeek,
    deletedCount: result.count
  });
  
  return result.count;
}

/**
 * Convert work schedule array to object format (for backward compatibility)
 * @param {Array} schedules - Array of WorkSchedule records
 * @returns {Object} Object with dayOfWeek as keys: { monday: { startTime, endTime }, ... }
 */
export function parseWorkScheduleArray(schedules) {
  const result = {};
  
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  dayOrder.forEach(day => {
    result[day] = null;
  });
  
  schedules.forEach(schedule => {
    if (schedule.isActive) {
      result[schedule.dayOfWeek] = {
        startTime: schedule.startTime,
        endTime: schedule.endTime
      };
    }
  });
  
  return result;
}

/**
 * Convert work schedule object to array format
 * @param {Object} workScheduleObject - Object with dayOfWeek as keys: { monday: { startTime, endTime }, ... }
 * @returns {Array} Array of schedule objects ready for database
 */
export function convertWorkScheduleObjectToArray(workScheduleObject) {
  const schedules = [];
  
  if (!workScheduleObject || typeof workScheduleObject !== 'object') {
    return schedules;
  }
  
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  validDays.forEach(day => {
    const daySchedule = workScheduleObject[day];
    
    if (daySchedule && typeof daySchedule === 'object' && daySchedule.startTime && daySchedule.endTime) {
      schedules.push({
        dayOfWeek: day,
        startTime: daySchedule.startTime,
        endTime: daySchedule.endTime,
        isActive: true
      });
    }
  });
  
  return schedules;
}

