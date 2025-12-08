import logger from './logger.js';

/**
 * Utility functions for work schedule operations
 */

/**
 * Validate work schedule object
 * @param {Object} workSchedule - Work schedule object: { monday: { startTime, endTime }, ... }
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export function validateWorkSchedule(workSchedule) {
  const errors = [];
  
  if (!workSchedule || typeof workSchedule !== 'object') {
    errors.push('Work schedule deve ser um objeto');
    return { isValid: false, errors };
  }
  
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  
  let hasAtLeastOneDay = false;
  
  validDays.forEach(day => {
    const daySchedule = workSchedule[day];
    
    // null ou undefined é válido (dia sem jornada)
    if (daySchedule === null || daySchedule === undefined) {
      return;
    }
    
    // Se tem valor, deve ser um objeto com startTime e endTime
    if (typeof daySchedule !== 'object') {
      errors.push(`${day}: deve ser um objeto ou null`);
      return;
    }
    
    if (!daySchedule.startTime || !daySchedule.endTime) {
      errors.push(`${day}: deve ter startTime e endTime`);
      return;
    }
    
    if (!timeRegex.test(daySchedule.startTime)) {
      errors.push(`${day}: startTime formato inválido (deve ser HH:mm)`);
      return;
    }
    
    if (!timeRegex.test(daySchedule.endTime)) {
      errors.push(`${day}: endTime formato inválido (deve ser HH:mm)`);
      return;
    }
    
    // Validar que endTime > startTime
    const [startHour, startMin] = daySchedule.startTime.split(':').map(Number);
    const [endHour, endMin] = daySchedule.endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (endMinutes <= startMinutes) {
      errors.push(`${day}: horário de término deve ser maior que horário de início`);
      return;
    }
    
    hasAtLeastOneDay = true;
  });
  
  if (!hasAtLeastOneDay) {
    errors.push('É necessário configurar pelo menos um dia da semana com horário de trabalho');
  }
  
  return {
    isValid: errors.length === 0 && hasAtLeastOneDay,
    errors
  };
}

/**
 * Convert day name from Portuguese to English
 * @param {string} dayName - Day name in Portuguese or English
 * @returns {string} Day name in English
 */
export function convertDayNameToEnglish(dayName) {
  const dayMap = {
    'segunda-feira': 'monday',
    'terça-feira': 'tuesday',
    'quarta-feira': 'wednesday',
    'quinta-feira': 'thursday',
    'sexta-feira': 'friday',
    'sábado': 'saturday',
    'domingo': 'sunday',
    'monday': 'monday',
    'tuesday': 'tuesday',
    'wednesday': 'wednesday',
    'thursday': 'thursday',
    'friday': 'friday',
    'saturday': 'saturday',
    'sunday': 'sunday'
  };
  
  const lowerDayName = dayName.toLowerCase().trim();
  return dayMap[lowerDayName] || lowerDayName;
}

/**
 * Get work schedule for a specific date from array of schedules
 * @param {Array} workSchedules - Array of WorkSchedule records from database
 * @param {Date} date - Date to get schedule for
 * @returns {Object|null} Schedule object { startTime, endTime } or null
 */
export function getScheduleForDate(workSchedules, date) {
  if (!workSchedules || !Array.isArray(workSchedules) || workSchedules.length === 0) {
    logger.debug('getScheduleForDate - nenhum horário disponível', {
      workSchedulesLength: workSchedules?.length || 0
    });
    return null;
  }
  
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = date.getDay();
  const dayName = dayNames[dayIndex];
  
  logger.debug('getScheduleForDate - buscando horário para o dia', {
    date: date.toISOString().split('T')[0],
    dayIndex,
    dayName,
    workSchedulesCount: workSchedules.length
  });
  
  const schedule = workSchedules.find(s => s.dayOfWeek === dayName && s.isActive);
  
  if (!schedule) {
    logger.debug('getScheduleForDate - nenhum horário encontrado para o dia', {
      dayName,
      availableDays: workSchedules.map(s => s.dayOfWeek)
    });
    return null;
  }
  
  logger.debug('getScheduleForDate - horário encontrado', {
    dayName,
    startTime: schedule.startTime,
    endTime: schedule.endTime
  });
  
  return {
    startTime: schedule.startTime,
    endTime: schedule.endTime
  };
}

/**
 * Calculate scheduled hours for a specific day
 * @param {Array} workSchedules - Array of WorkSchedule records
 * @param {Date} date - Date to calculate for
 * @param {number} lunchBreakHours - Hours of lunch break
 * @returns {number} Scheduled hours for the day
 */
export function getScheduledHoursForDate(workSchedules, date, lunchBreakHours = 0) {
  const schedule = getScheduleForDate(workSchedules, date);
  
  if (!schedule) {
    return 0;
  }
  
  const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
  const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
  
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  
  const totalMinutes = endMinutes - startMinutes;
  const totalHours = totalMinutes / 60;
  
  // Subtract lunch break hours
  const lunchMinutes = lunchBreakHours * 60;
  const scheduledMinutes = totalMinutes - lunchMinutes;
  
  return Math.max(0, Number((scheduledMinutes / 60).toFixed(2)));
}

