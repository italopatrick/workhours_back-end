import express from 'express';
import { protect, admin, adminOrManager } from '../middleware/auth.js';
import { checkEmployeeDepartment } from '../middleware/departmentAccess.js';
import { 
  findUsers, 
  findUserById, 
  findUserByEmail, 
  createUser, 
  updateUser, 
  deleteUser 
} from '../models/user.model.js';
import {
  createOrUpdateWorkSchedule,
  getWorkScheduleByEmployee,
  parseWorkScheduleArray,
  convertWorkScheduleObjectToArray
} from '../models/workSchedule.model.js';
import { validateWorkSchedule } from '../utils/workScheduleUtils.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get all employees (authenticated users)
router.get('/', protect, async (req, res) => {
  try {
    const { department } = req.query;
    
    // Construir query baseado na role
    let query = {};
    
    if (req.user.role === 'admin') {
      // Admin vê todos, mas pode filtrar por departamento se fornecido
      if (department) {
        query.department = department;
      }
    } else if (req.user.role === 'manager') {
      // Manager só vê funcionários do seu departamento
      query.department = req.user.department;
      
      // Se forneceu department diferente, ignorar (manager só vê seu departamento)
      if (department && department !== req.user.department) {
        logger.warn('Manager tentando filtrar por outro departamento', {
          userId: req.user.id,
          userDepartment: req.user.department,
          requestedDepartment: department
        });
      }
    } else {
      // Employee não vê outros funcionários (ou retorna apenas não-admin)
      query.role = { not: 'admin' };
    }
    
      const employees = await findUsers(query, {
        orderBy: { name: 'asc' }
      });
      
      // Formata os resultados
      const formattedEmployees = employees.map(emp => {
        // Converter workSchedules para formato JSON (prioridade na nova tabela)
        let workSchedule = null;
        if (emp.workSchedules && emp.workSchedules.length > 0) {
          workSchedule = parseWorkScheduleArray(emp.workSchedules);
        } else if (emp.workSchedule) {
          // Fallback para formato antigo durante migração
          workSchedule = emp.workSchedule;
        }

        return {
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.department,
          role: emp.role,
          overtimeLimit: emp.overtimeLimit,
          overtimeExceptions: emp.overtimeExceptions || [],
          workSchedule,
          lunchBreakHours: emp.lunchBreakHours,
          lateTolerance: emp.lateTolerance
        };
      });
      
    res.json(formattedEmployees);
  } catch (error) {
    logger.logError(error, { context: 'Buscar funcionários' });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new employee (admin only)
router.post('/', protect, admin, async (req, res) => {
  try {
    const { name, email, password, department, role, overtimeLimit, workSchedule, lunchBreakHours, lateTolerance } = req.body;

    const userExists = await findUserByEmail(email);
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const user = await createUser({
      name,
      email,
      password,
      department,
      role: role || 'employee',
      overtimeLimit: overtimeLimit || null,
      workSchedule: workSchedule || null, // Manter para backward compatibility
      lunchBreakHours: lunchBreakHours ? Number(lunchBreakHours) : null,
      lateTolerance: lateTolerance ? Number(lateTolerance) : 10,
    });

    // Se workSchedule foi fornecido, criar na nova tabela normalizada também
    if (workSchedule) {
      try {
        const validation = validateWorkSchedule(workSchedule);
        if (validation.isValid) {
          const schedulesArray = convertWorkScheduleObjectToArray(workSchedule);
          if (schedulesArray.length > 0) {
            await createOrUpdateWorkSchedule(user.id, schedulesArray);
            logger.info('Jornada criada na tabela normalizada para novo funcionário', {
              userId: user.id,
              schedulesCount: schedulesArray.length
            });
          }
        }
      } catch (error) {
        logger.logError(error, { context: 'Erro ao criar jornada normalizada para novo funcionário', userId: user.id });
        // Não falhar a criação do usuário se a jornada falhar
      }
    }

    // Buscar jornada atualizada para retornar
    const schedules = await getWorkScheduleByEmployee(user.id, false);
    const workScheduleObject = schedules && schedules.length > 0 
      ? parseWorkScheduleArray(schedules) 
      : user.workSchedule;

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'employee_created',
      entityType: 'employee',
      entityId: user.id,
      userId: req.user.id,
      targetUserId: user.id,
      description: `Funcionário criado: ${name} (${email})`,
      metadata: {
        name,
        email,
        department,
        role: role || 'employee',
        overtimeLimit: overtimeLimit || null,
        workSchedule: workScheduleObject,
        lunchBreakHours,
        lateTolerance
      },
      ...requestMeta
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      overtimeLimit: user.overtimeLimit,
      overtimeExceptions: user.overtimeExceptions || [],
      workSchedule: workScheduleObject,
      lunchBreakHours: user.lunchBreakHours,
      lateTolerance: user.lateTolerance
    });
  } catch (error) {
    logger.logError(error, { context: 'Criar funcionário', userId: req.user?._id });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete employee (admin only)
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Não permite deletar o próprio usuário
    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    // Registrar log de auditoria antes de deletar
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'employee_deleted',
      entityType: 'employee',
      entityId: user.id,
      userId: req.user.id,
      targetUserId: user.id,
      description: `Funcionário excluído: ${user.name} (${user.email})`,
      metadata: {
        name: user.name,
        email: user.email,
        department: user.department,
        role: user.role
      },
      ...requestMeta
    });

    // Deleta o usuário
    await deleteUser(user.id);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.logError(error, { context: 'Excluir funcionário', employeeId: req.params.id, userId: req.user?._id });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Atualizar limite de horas extras de um funcionário (admin ou manager)
router.patch('/:id/overtime-limit', protect, adminOrManager, async (req, res) => {
  try {
    const { overtimeLimit } = req.body;
    
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Se for manager, verificar se o funcionário pertence ao seu departamento
    if (req.user.role === 'manager') {
      const hasAccess = await checkEmployeeDepartment(req.params.id, req.user);
      if (!hasAccess) {
        return res.status(403).json({ 
          message: 'Você só pode gerenciar funcionários do seu departamento.' 
        });
      }
    }

    const oldLimit = user.overtimeLimit;
    const newLimit = overtimeLimit === null || overtimeLimit === undefined ? null : Number(overtimeLimit);
    
    // Atualiza o limite de horas extras
    const updatedUser = await updateUser(user.id, {
      overtimeLimit: newLimit
    });

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'employee_limit_changed',
      entityType: 'employee',
      entityId: updatedUser.id,
      userId: req.user.id,
      targetUserId: updatedUser.id,
      description: `Limite de horas extras alterado para ${updatedUser.name}: ${oldLimit || 'N/A'}h → ${updatedUser.overtimeLimit || 'N/A'}h`,
      metadata: {
        oldLimit: oldLimit || null,
        newLimit: updatedUser.overtimeLimit || null
      },
      ...requestMeta
    });

    res.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      department: updatedUser.department,
      role: updatedUser.role,
      overtimeLimit: updatedUser.overtimeLimit,
      overtimeExceptions: updatedUser.overtimeExceptions || []
    });
  } catch (error) {
    logger.logError(error, { context: 'Atualizar limite de horas extras', employeeId: req.params.id, userId: req.user?._id });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Adicionar exceção mensal de horas extras (admin ou manager)
router.post('/:id/overtime-exception', protect, adminOrManager, async (req, res) => {
  try {
    const { month, year, additionalHours } = req.body;
    
    if (!month || !year || additionalHours === undefined) {
      return res.status(400).json({ message: 'Mês, ano e horas adicionais são obrigatórios' });
    }

    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Se for manager, verificar se o funcionário pertence ao seu departamento
    if (req.user.role === 'manager') {
      const hasAccess = await checkEmployeeDepartment(req.params.id, req.user);
      if (!hasAccess) {
        return res.status(403).json({ 
          message: 'Você só pode gerenciar funcionários do seu departamento.' 
        });
      }
    }

    // Verifica se já existe uma exceção para este mês/ano
    const exceptions = user.overtimeExceptions || [];
    const existingExceptionIndex = exceptions.findIndex(
      e => e.month === Number(month) && e.year === Number(year)
    );

    let updatedExceptions;
    if (existingExceptionIndex >= 0) {
      // Atualiza a exceção existente
      updatedExceptions = [...exceptions];
      updatedExceptions[existingExceptionIndex].additionalHours = Number(additionalHours);
    } else {
      // Adiciona nova exceção
      updatedExceptions = [...exceptions, {
        month: Number(month),
        year: Number(year),
        additionalHours: Number(additionalHours)
      }];
    }

    const updatedUser = await updateUser(user.id, {
      overtimeExceptions: updatedExceptions
    });

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'employee_exception_added',
      entityType: 'employee',
      entityId: updatedUser.id,
      userId: req.user.id,
      targetUserId: updatedUser.id,
      description: `Exceção de horas extras adicionada para ${updatedUser.name}: ${additionalHours}h extras em ${month}/${year}`,
      metadata: {
        month: Number(month),
        year: Number(year),
        additionalHours: Number(additionalHours),
        isUpdate: existingExceptionIndex >= 0
      },
      ...requestMeta
    });

    res.json({
      id: updatedUser.id,
      name: updatedUser.name,
      overtimeLimit: updatedUser.overtimeLimit,
      overtimeExceptions: updatedUser.overtimeExceptions
    });
  } catch (error) {
    logger.logError(error, { context: 'Adicionar exceção de horas extras', employeeId: req.params.id, userId: req.user?._id });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Remover exceção mensal de horas extras (admin ou manager)
router.delete('/:id/overtime-exception/:month/:year', protect, adminOrManager, async (req, res) => {
  try {
    const { id, month, year } = req.params;
    
    const user = await findUserById(id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Se for manager, verificar se o funcionário pertence ao seu departamento
    if (req.user.role === 'manager') {
      const hasAccess = await checkEmployeeDepartment(id, req.user);
      if (!hasAccess) {
        return res.status(403).json({ 
          message: 'Você só pode gerenciar funcionários do seu departamento.' 
        });
      }
    }

    // Remove a exceção para este mês/ano
    const exceptions = user.overtimeExceptions || [];
    const filteredExceptions = exceptions.filter(
      e => !(e.month === Number(month) && e.year === Number(year))
    );

    if (exceptions.length !== filteredExceptions.length) {
      const updatedUser = await updateUser(user.id, {
        overtimeExceptions: filteredExceptions
      });

      // Registrar log de auditoria
      const requestMeta = getRequestMetadata(req);
      await logAudit({
        action: 'employee_exception_removed',
        entityType: 'employee',
        entityId: updatedUser.id,
        userId: req.user.id,
        targetUserId: updatedUser.id,
        description: `Exceção de horas extras removida para ${updatedUser.name}: mês ${month}/${year}`,
        metadata: {
          month: Number(month),
          year: Number(year)
        },
        ...requestMeta
      });

      res.json({
        id: updatedUser.id,
        name: updatedUser.name,
        overtimeLimit: updatedUser.overtimeLimit,
        overtimeExceptions: updatedUser.overtimeExceptions
      });
    } else {
      res.json({
        id: user.id,
        name: user.name,
        overtimeLimit: user.overtimeLimit,
        overtimeExceptions: user.overtimeExceptions
      });
    }
  } catch (error) {
    logger.logError(error, { context: 'Remover exceção de horas extras', employeeId: req.params.id, userId: req.user?._id });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Atualizar role de um funcionário (admin only)
router.patch('/:id/role', protect, admin, async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!role || !['admin', 'manager', 'employee'].includes(role)) {
      return res.status(400).json({ message: 'Role inválida. Use "admin", "manager" ou "employee"' });
    }

    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Não permite alterar a própria role
    if (user.id === req.user.id) {
      return res.status(400).json({ message: 'Você não pode alterar sua própria função' });
    }

    const oldRole = user.role;

    // Atualiza a role
    const updatedUser = await updateUser(user.id, { role });

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'employee_role_changed',
      entityType: 'employee',
      entityId: updatedUser.id,
      userId: req.user.id,
      targetUserId: updatedUser.id,
      description: `Role alterada para ${updatedUser.name}: ${oldRole} → ${role}`,
      metadata: {
        oldRole,
        newRole: role
      },
      ...requestMeta
    });

    res.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      department: updatedUser.department,
      role: updatedUser.role,
      overtimeLimit: updatedUser.overtimeLimit,
      overtimeExceptions: updatedUser.overtimeExceptions || [],
      workSchedule: updatedUser.workSchedule,
      lunchBreakHours: updatedUser.lunchBreakHours,
      lateTolerance: updatedUser.lateTolerance
    });
  } catch (error) {
    logger.logError(error, { context: 'Atualizar role do funcionário', employeeId: req.params.id, userId: req.user?._id });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Função compartilhada para criar/atualizar jornada de trabalho
const handleWorkScheduleUpdate = async (req, res) => {
  try {
    const { workSchedule, lunchBreakHours, lateTolerance } = req.body;
    const isPost = req.method === 'POST';
    const isPatch = req.method === 'PATCH';
    
    logger.info(`${isPost ? 'Criando' : 'Atualizando'} jornada de trabalho`, { 
      method: req.method,
      employeeId: req.params.id, 
      workSchedule: workSchedule ? 'presente' : 'ausente',
      workScheduleKeys: workSchedule ? Object.keys(workSchedule) : [],
      lunchBreakHours,
      lateTolerance
    });
    
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Buscar jornada existente na nova tabela normalizada
    const existingSchedules = await getWorkScheduleByEmployee(user.id, false);
    const hasExistingSchedule = existingSchedules && existingSchedules.length > 0;

    logger.info('Estado da jornada atual', {
      employeeId: user.id,
      hasExistingSchedule,
      existingSchedulesCount: existingSchedules?.length || 0,
      method: req.method
    });

    // POST: só deve criar se não existir jornada válida
    if (isPost && hasExistingSchedule) {
      logger.warn('Tentativa de criar jornada que já existe - use PATCH para atualizar', {
        employeeId: user.id,
        hasExistingSchedule,
        existingSchedulesCount: existingSchedules.length
      });
      return res.status(400).json({ 
        message: 'Jornada de trabalho já cadastrada para este funcionário. Use PATCH para atualizar.' 
      });
    }

    // PATCH: pode criar ou atualizar (flexível)
    if (isPatch && !hasExistingSchedule) {
      logger.info('PATCH usado para criar jornada (não existia antes)', {
        employeeId: user.id,
        hasExistingSchedule
      });
    }

    // Validar e processar workSchedule
    if (workSchedule === undefined) {
      return res.status(400).json({ message: 'Jornada de trabalho é obrigatória.' });
    }

    // Se workSchedule for string, tentar fazer parse
    let parsedWorkSchedule = workSchedule;
    if (typeof workSchedule === 'string') {
      try {
        parsedWorkSchedule = JSON.parse(workSchedule);
      } catch (e) {
        logger.warn('Erro ao fazer parse do workSchedule', { 
          employeeId: req.params.id,
          error: e.message,
          workSchedule 
        });
        return res.status(400).json({ 
          message: 'Formato de jornada de trabalho inválido.' 
        });
      }
    }

    // Validar formato da jornada
    const validation = validateWorkSchedule(parsedWorkSchedule);
    if (!validation.isValid) {
      logger.warn('Validação de jornada falhou', {
        employeeId: req.params.id,
        errors: validation.errors
      });
      return res.status(400).json({ 
        message: validation.errors.join('; ') 
      });
    }

    logger.info('Jornada validada com sucesso', { 
      employeeId: req.params.id,
      daysConfigured: Object.entries(parsedWorkSchedule)
        .filter(([_, day]) => day !== null && day !== undefined && typeof day === 'object' && day.startTime && day.endTime)
        .map(([day, _]) => day)
    });

    // Converter objeto JSON para array de schedules
    const schedulesArray = convertWorkScheduleObjectToArray(parsedWorkSchedule);
    
    logger.info('Convertendo jornada para array', {
      employeeId: req.params.id,
      schedulesCount: schedulesArray.length,
      schedules: schedulesArray
    });

    // Criar/atualizar jornada na tabela normalizada
    const createdSchedules = await createOrUpdateWorkSchedule(user.id, schedulesArray);

    // Atualizar campos lunchBreakHours e lateTolerance no usuário
    const updateData = {};
    if (lunchBreakHours !== undefined) updateData.lunchBreakHours = lunchBreakHours ? Number(lunchBreakHours) : null;
    if (lateTolerance !== undefined) updateData.lateTolerance = lateTolerance ? Number(lateTolerance) : 10;

    if (Object.keys(updateData).length > 0) {
      await updateUser(user.id, updateData);
    }

    // Buscar usuário atualizado com jornada
    const updatedUser = await findUserById(user.id);
    const updatedSchedules = await getWorkScheduleByEmployee(user.id, false);
    
    // Converter de volta para objeto JSON (para compatibilidade com frontend)
    const workScheduleObject = parseWorkScheduleArray(updatedSchedules);

    logger.info(`Jornada ${isPost ? 'criada' : 'atualizada'} com sucesso`, { 
      employeeId: user.id,
      method: req.method,
      action: isPost ? 'create' : 'update',
      schedulesCreated: createdSchedules.length,
      workSchedule: workScheduleObject
    });

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    const action = isPost ? 'Criar' : 'Atualizar';
    await logAudit({
      action: isPost ? 'employee_created' : 'employee_work_schedule_updated',
      entityType: 'employee',
      entityId: user.id,
      userId: req.user.id,
      targetUserId: user.id,
      description: `Jornada de trabalho ${isPost ? 'criada' : 'atualizada'} para ${updatedUser.name}`,
      metadata: {
        method: req.method,
        action,
        schedulesCount: createdSchedules.length,
        workSchedule: workScheduleObject,
        lunchBreakHours: updatedUser.lunchBreakHours,
        lateTolerance: updatedUser.lateTolerance,
        hadExistingSchedule: hasExistingSchedule
      },
      ...requestMeta
    });

    // Retornar formato compatível com frontend (objeto JSON)
    res.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      department: updatedUser.department,
      role: updatedUser.role,
      overtimeLimit: updatedUser.overtimeLimit,
      overtimeExceptions: updatedUser.overtimeExceptions || [],
      workSchedule: workScheduleObject,
      lunchBreakHours: updatedUser.lunchBreakHours,
      lateTolerance: updatedUser.lateTolerance
    });
  } catch (error) {
    logger.logError(error, { context: 'Atualizar jornada de trabalho', employeeId: req.params.id, userId: req.user?.id });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
};

// GET /api/employees/:id/work-schedule - Buscar jornada de trabalho (admin ou manager)
router.get('/:id/work-schedule', protect, adminOrManager, async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Se for manager, verificar se o funcionário pertence ao seu departamento
    if (req.user.role === 'manager') {
      const hasAccess = await checkEmployeeDepartment(req.params.id, req.user);
      if (!hasAccess) {
        return res.status(403).json({ 
          message: 'Você só pode gerenciar funcionários do seu departamento.' 
        });
      }
    }

    // Buscar jornada da tabela normalizada
    const schedules = await getWorkScheduleByEmployee(user.id, false);
    
    // Converter para formato JSON (compatibilidade com frontend)
    const workScheduleObject = parseWorkScheduleArray(schedules);

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      workSchedule: workScheduleObject,
      lunchBreakHours: user.lunchBreakHours,
      lateTolerance: user.lateTolerance,
      schedulesCount: schedules.length
    });
  } catch (error) {
    logger.logError(error, { context: 'Buscar jornada de trabalho', employeeId: req.params.id, userId: req.user?.id });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Criar ou atualizar jornada de trabalho (admin ou manager)
// POST para criar inicialmente, PATCH para atualizar
router.post('/:id/work-schedule', protect, adminOrManager, handleWorkScheduleUpdate);
router.patch('/:id/work-schedule', protect, adminOrManager, handleWorkScheduleUpdate);

export default router;
