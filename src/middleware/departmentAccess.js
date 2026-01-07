import { findUserById } from '../models/user.model.js';
import logger from '../utils/logger.js';

/**
 * Middleware para verificar acesso por departamento
 * Manager só pode acessar recursos do seu próprio departamento
 * Admin pode acessar tudo
 */
export const checkDepartmentAccess = async (req, res, next) => {
  try {
    const user = req.user;

    // Admin tem acesso total
    if (user.role === 'admin') {
      return next();
    }

    // Employee não precisa de validação de departamento (já filtra por próprio ID)
    if (user.role === 'employee') {
      return next();
    }

    // Manager precisa validar departamento
    if (user.role === 'manager') {
      const departmentParam = req.query.department || req.body.department || req.params.department;
      
      // Se há parâmetro de departamento, verificar se corresponde ao do manager
      if (departmentParam && departmentParam !== user.department) {
        logger.warn('Acesso negado: manager tentando acessar outro departamento', {
          userId: user.id,
          userName: user.name,
          userDepartment: user.department,
          requestedDepartment: departmentParam,
          url: req.originalUrl || req.url
        });
        return res.status(403).json({ 
          message: 'Acesso negado. Você só pode acessar recursos do seu departamento.' 
        });
      }
    }

    next();
  } catch (error) {
    logger.logError(error, { context: 'Middleware de validação de departamento', url: req.originalUrl || req.url });
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
};

/**
 * Verifica se um funcionário pertence ao departamento do manager
 * @param {string} employeeId - ID do funcionário
 * @param {Object} manager - Objeto do manager (com department)
 * @returns {Promise<boolean>} True se pertence ao departamento
 */
export const checkEmployeeDepartment = async (employeeId, manager) => {
  try {
    if (manager.role === 'admin') {
      return true; // Admin pode acessar qualquer funcionário
    }

    if (manager.role === 'manager') {
      const employee = await findUserById(employeeId);
      if (!employee) {
        return false;
      }
      return employee.department === manager.department;
    }

    return false;
  } catch (error) {
    logger.logError(error, { context: 'Verificar departamento do funcionário', employeeId, managerId: manager.id });
    return false;
  }
};

export default {
  checkDepartmentAccess,
  checkEmployeeDepartment
};

