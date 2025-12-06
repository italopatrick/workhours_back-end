import bcrypt from 'bcryptjs';
import logger from './logger.js';

/**
 * Hash a password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
  try {
    logger.debug('Hashing password');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    logger.debug('Password hashed successfully');
    return hashedPassword;
  } catch (error) {
    logger.logError(error, { context: 'Password hashing' });
    throw error;
  }
}

/**
 * Compare a plain text password with a hashed password
 * @param {string} candidatePassword - Plain text password to compare
 * @param {string} hashedPassword - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match
 */
export async function matchPassword(candidatePassword, hashedPassword) {
  try {
    logger.debug('Comparing password');
    const isMatch = await bcrypt.compare(candidatePassword, hashedPassword);
    logger.debug('Password comparison result', { match: isMatch });
    return isMatch;
  } catch (error) {
    logger.logError(error, { context: 'Password comparison' });
    throw error;
  }
}

