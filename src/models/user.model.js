import prisma from '../config/database.js';
import { hashPassword, matchPassword } from '../utils/password.js';
import logger from '../utils/logger.js';

/**
 * User model helper functions using Prisma
 */

/**
 * Create a new user with password hashing
 * @param {Object} userData - User data
 * @param {string} userData.name - User name
 * @param {string} userData.email - User email
 * @param {string} [userData.password] - User password (will be hashed)
 * @param {string} userData.department - User department
 * @param {string} [userData.role] - User role (default: 'employee')
 * @param {string} [userData.externalId] - External ID for external auth
 * @param {boolean} [userData.externalAuth] - Whether user uses external auth
 * @param {number} [userData.overtimeLimit] - Overtime limit
 * @param {Array} [userData.overtimeExceptions] - Overtime exceptions
 * @returns {Promise<Object>} Created user
 */
export async function createUser(userData) {
  const {
    name,
    email,
    password,
    department,
    role = 'employee',
    externalId,
    externalAuth = false,
    overtimeLimit,
    overtimeExceptions
  } = userData;

  // Hash password if provided and not external auth
  let hashedPassword = null;
  if (password && !externalAuth) {
    hashedPassword = await hashPassword(password);
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      department,
      role,
      externalId,
      externalAuth,
      overtimeLimit,
      overtimeExceptions: overtimeExceptions || null
    }
  });

  return user;
}

/**
 * Find user by ID
 * @param {string} id - User ID
 * @param {boolean} includePassword - Whether to include password field
 * @returns {Promise<Object|null>} User or null
 */
export async function findUserById(id, includePassword = false) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: includePassword ? undefined : {
      id: true,
      email: true,
      role: true,
      name: true,
      department: true,
      externalId: true,
      externalAuth: true,
      overtimeLimit: true,
      overtimeExceptions: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return user;
}

/**
 * Find user by email
 * @param {string} email - User email
 * @param {boolean} includePassword - Whether to include password field
 * @returns {Promise<Object|null>} User or null
 */
export async function findUserByEmail(email, includePassword = false) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: includePassword ? undefined : {
      id: true,
      email: true,
      role: true,
      name: true,
      department: true,
      externalId: true,
      externalAuth: true,
      overtimeLimit: true,
      overtimeExceptions: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return user;
}

/**
 * Find user by external ID
 * @param {string} externalId - External ID
 * @returns {Promise<Object|null>} User or null
 */
export async function findUserByExternalId(externalId) {
  const user = await prisma.user.findUnique({
    where: { externalId }
  });

  return user;
}

/**
 * Find users with query
 * @param {Object} query - Query object
 * @param {Object} options - Options (select, sort, etc.)
 * @returns {Promise<Array>} Array of users
 */
export async function findUsers(query = {}, options = {}) {
  const { select, orderBy, skip, take } = options;

  const users = await prisma.user.findMany({
    where: query,
    select: select || {
      id: true,
      email: true,
      role: true,
      name: true,
      department: true,
      externalId: true,
      externalAuth: true,
      overtimeLimit: true,
      overtimeExceptions: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: orderBy || { name: 'asc' },
    skip,
    take
  });

  return users;
}

/**
 * Update user
 * @param {string} id - User ID
 * @param {Object} data - Data to update
 * @returns {Promise<Object>} Updated user
 */
export async function updateUser(id, data) {
  // If password is being updated and user is not external, hash it
  if (data.password && !data.externalAuth) {
    data.password = await hashPassword(data.password);
  }

  const user = await prisma.user.update({
    where: { id },
    data
  });

  return user;
}

/**
 * Delete user
 * @param {string} id - User ID
 * @returns {Promise<Object>} Deleted user
 */
export async function deleteUser(id) {
  const user = await prisma.user.delete({
    where: { id }
  });

  return user;
}

/**
 * Check if password matches for a user
 * @param {string} userId - User ID
 * @param {string} candidatePassword - Password to check
 * @returns {Promise<boolean>} True if password matches
 */
export async function checkUserPassword(userId, candidatePassword) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true, externalAuth: true }
  });

  if (!user) {
    return false;
  }

  // If external auth user without password, don't allow local login
  if (user.externalAuth && !user.password) {
    logger.warn('External user without password tried local login', { userId });
    return false;
  }

  if (!user.password) {
    return false;
  }

  return await matchPassword(candidatePassword, user.password);
}

/**
 * Check if admin user exists
 * @returns {Promise<boolean>} True if admin exists
 */
export async function adminExists() {
  const admin = await prisma.user.findFirst({
    where: { role: 'admin' }
  });

  return !!admin;
}

export default {
  createUser,
  findUserById,
  findUserByEmail,
  findUserByExternalId,
  findUsers,
  updateUser,
  deleteUser,
  checkUserPassword,
  adminExists
};

