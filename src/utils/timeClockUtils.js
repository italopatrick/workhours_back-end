/**
 * Utilities for time clock calculations
 */

import logger from './logger.js';
import { getScheduleForDate, getScheduledHoursForDate } from './workScheduleUtils.js';

/**
 * Calculate worked hours between two times (excluding lunch break)
 * @param {Date} entryTime - Entry time
 * @param {Date} exitTime - Exit time
 * @param {number} lunchBreakHours - Hours of lunch break
 * @returns {number} Total worked hours
 */
export function calculateWorkedHours(entryTime, exitTime, lunchBreakHours = 0) {
  if (!entryTime || !exitTime) {
    return 0;
  }

  const diffMs = exitTime.getTime() - entryTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  // Subtract lunch break hours
  return Math.max(0, diffHours - lunchBreakHours);
}

/**
 * Calculate late minutes
 * @param {Date} entryTime - Actual entry time
 * @param {string} scheduledStartTime - Scheduled start time (format: "HH:mm")
 * @param {number} tolerance - Tolerance in minutes (default: 10)
 * @returns {number} Minutes of delay (0 if on time or within tolerance)
 */
export function calculateLateMinutes(entryTime, scheduledStartTime, tolerance = 10) {
  if (!entryTime || !scheduledStartTime) {
    return 0;
  }

  const [scheduledHour, scheduledMinute] = scheduledStartTime.split(':').map(Number);
  const scheduledDate = new Date(entryTime);
  scheduledDate.setHours(scheduledHour, scheduledMinute, 0, 0);

  const diffMs = entryTime.getTime() - scheduledDate.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  // If within tolerance or early, return 0
  if (diffMinutes <= tolerance) {
    return 0;
  }

  return Math.round(diffMinutes);
}

/**
 * Calculate overtime hours
 * @param {Date} exitTime - Actual exit time
 * @param {string} scheduledEndTime - Scheduled end time (format: "HH:mm")
 * @returns {number} Overtime hours (0 if not overtime)
 */
export function calculateOvertimeHours(exitTime, scheduledEndTime) {
  if (!exitTime || !scheduledEndTime) {
    return 0;
  }

  const [scheduledHour, scheduledMinute] = scheduledEndTime.split(':').map(Number);
  const scheduledDate = new Date(exitTime);
  scheduledDate.setHours(scheduledHour, scheduledMinute, 0, 0);

  const diffMs = exitTime.getTime() - scheduledDate.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  // Only return positive overtime (if left early, return 0)
  return Math.max(0, diffHours);
}

/**
 * Get work schedule for a specific day
 * @param {Array|Object} workSchedulesOrUser - Array of WorkSchedule records OR User object with workSchedules relation
 * @param {Date} date - Date to get schedule for
 * @returns {Object|null} Schedule object { startTime, endTime } or null
 */
export function getWorkScheduleForDay(workSchedulesOrUser, date) {
  let workSchedules = null;
  
  // Support both array of schedules or user object with workSchedules relation
  if (Array.isArray(workSchedulesOrUser)) {
    workSchedules = workSchedulesOrUser;
  } else if (workSchedulesOrUser?.workSchedules) {
    workSchedules = workSchedulesOrUser.workSchedules;
  } else if (workSchedulesOrUser?.workSchedule) {
    // Backward compatibility: if old JSON format exists, convert it
    logger.warn('getWorkScheduleForDay - usando formato antigo (JSON), deve migrar para tabela normalizada', {
      userId: workSchedulesOrUser?.id
    });
    // Try to use old format for backward compatibility
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIndex = date.getDay();
    const dayName = dayNames[dayIndex];
    const schedule = workSchedulesOrUser.workSchedule?.[dayName];
    
    if (schedule && schedule !== null) {
      return schedule;
    }
    return null;
  }
  
  return getScheduleForDate(workSchedules, date);
}

/**
 * Get scheduled hours for a specific day
 * @param {Array|Object} workSchedulesOrUser - Array of WorkSchedule records OR User object with workSchedules relation and lunchBreakHours
 * @param {Date} date - Date to calculate for
 * @returns {number} Scheduled hours for the day
 */
export function getScheduledHoursForDay(workSchedulesOrUser, date) {
  let workSchedules = null;
  let lunchBreakHours = 0;
  
  // Support both array of schedules or user object
  if (Array.isArray(workSchedulesOrUser)) {
    workSchedules = workSchedulesOrUser;
  } else if (workSchedulesOrUser?.workSchedules) {
    workSchedules = workSchedulesOrUser.workSchedules;
    lunchBreakHours = workSchedulesOrUser.lunchBreakHours || 0;
  } else if (workSchedulesOrUser?.workSchedule) {
    // Backward compatibility: if old JSON format exists, calculate manually
    logger.warn('getScheduledHoursForDay - usando formato antigo (JSON), deve migrar para tabela normalizada', {
      userId: workSchedulesOrUser?.id
    });
    const schedule = getWorkScheduleForDay(workSchedulesOrUser, date);
    
    if (!schedule) {
      return 0;
    }
    
    const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
    const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    
    const totalMinutes = endMinutes - startMinutes;
    const totalHours = totalMinutes / 60;
    
    lunchBreakHours = workSchedulesOrUser.lunchBreakHours || 0;
    return Math.max(0, totalHours - lunchBreakHours);
  }
  
  return getScheduledHoursForDate(workSchedules, date, lunchBreakHours);
}

/**
 * Format date to YYYY-MM-DD string
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse time string to Date (using current date as base)
 * @param {string} timeString - Time string in format "HH:mm"
 * @param {Date} baseDate - Base date to use
 * @returns {Date|null} Parsed date or null if invalid
 */
export function parseTimeString(timeString, baseDate) {
  if (!timeString || !baseDate) {
    return null;
  }

  const [hour, minute] = timeString.split(':').map(Number);
  if (isNaN(hour) || isNaN(minute)) {
    return null;
  }

  const date = new Date(baseDate);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/**
 * Valida se o horário de entrada está dentro do permitido
 * @param {Date} entryTime - Horário de entrada
 * @param {string} scheduledStartTime - Horário de início agendado (format: "HH:mm")
 * @param {number} tolerance - Tolerância em minutos (default: 10)
 * @returns {Object} { valid: boolean, message: string, minAllowedTime: string }
 */
export function validateEntryTime(entryTime, scheduledStartTime, tolerance = 10) {
  if (!entryTime || !scheduledStartTime) {
    return {
      valid: true, // Se não tem horário agendado, permitir
      message: '',
      minAllowedTime: null
    };
  }

  const [scheduledHour, scheduledMinute] = scheduledStartTime.split(':').map(Number);
  const scheduledDate = new Date(entryTime);
  scheduledDate.setHours(scheduledHour, scheduledMinute, 0, 0);

  // Calcular horário mínimo permitido (horário agendado - tolerância)
  const minAllowedDate = new Date(scheduledDate);
  minAllowedDate.setMinutes(minAllowedDate.getMinutes() - tolerance);

  // Formatar horário mínimo para exibição
  const minAllowedTime = `${String(minAllowedDate.getHours()).padStart(2, '0')}:${String(minAllowedDate.getMinutes()).padStart(2, '0')}`;

  // Verificar se entrada é antes do horário mínimo
  if (entryTime < minAllowedDate) {
    return {
      valid: false,
      message: `Não é possível registrar entrada antes de ${minAllowedTime}. Horário de início: ${scheduledStartTime}, Tolerância: ${tolerance} minutos.`,
      minAllowedTime
    };
  }

  return {
    valid: true,
    message: '',
    minAllowedTime
  };
}

