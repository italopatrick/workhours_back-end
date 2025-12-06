/**
 * Validações para dados migrados
 */

/**
 * Valida se um valor é um ObjectId válido do MongoDB
 * @param {any} value
 * @returns {boolean}
 */
export function isValidObjectId(value) {
  if (!value) return false;
  const str = String(value);
  return /^[0-9a-fA-F]{24}$/.test(str);
}

/**
 * Valida se um valor é um UUID válido
 * @param {any} value
 * @returns {boolean}
 */
export function isValidUUID(value) {
  if (!value) return false;
  const str = String(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Valida enum UserRole
 * @param {string} role
 * @returns {boolean}
 */
export function isValidUserRole(role) {
  return ['admin', 'employee'].includes(role);
}

/**
 * Valida enum OvertimeStatus
 * @param {string} status
 * @returns {boolean}
 */
export function isValidOvertimeStatus(status) {
  return ['pending', 'approved', 'rejected'].includes(status);
}

/**
 * Valida enum HourBankType
 * @param {string} type
 * @returns {boolean}
 */
export function isValidHourBankType(type) {
  return ['credit', 'debit'].includes(type);
}

/**
 * Valida enum HourBankStatus
 * @param {string} status
 * @returns {boolean}
 */
export function isValidHourBankStatus(status) {
  return ['pending', 'approved', 'rejected'].includes(status);
}

/**
 * Valida enum AuditAction
 * @param {string} action
 * @returns {boolean}
 */
export function isValidAuditAction(action) {
  const validActions = [
    'overtime_created',
    'overtime_approved',
    'overtime_rejected',
    'overtime_updated',
    'hourbank_credit_created',
    'hourbank_debit_created',
    'hourbank_approved',
    'hourbank_rejected',
    'employee_created',
    'employee_deleted',
    'employee_role_changed',
    'employee_limit_changed',
    'employee_exception_added',
    'employee_exception_removed',
    'settings_updated',
    'settings_logo_updated'
  ];
  return validActions.includes(action);
}

/**
 * Valida enum EntityType
 * @param {string} entityType
 * @returns {boolean}
 */
export function isValidEntityType(entityType) {
  return ['overtime', 'hourbank', 'employee', 'settings'].includes(entityType);
}

/**
 * Valida formato de data YYYY-MM-DD
 * @param {string} date
 * @returns {boolean}
 */
export function isValidDateFormat(date) {
  if (!date || typeof date !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) return false;
  const d = new Date(date);
  return d instanceof Date && !isNaN(d);
}

/**
 * Valida formato de hora HH:mm
 * @param {string} time
 * @returns {boolean}
 */
export function isValidTimeFormat(time) {
  if (!time || typeof time !== 'string') return false;
  return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

/**
 * Valida email
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

