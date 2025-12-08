import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import { 
  findUsers, 
  findUserById, 
  findUserByEmail, 
  createUser, 
  updateUser, 
  deleteUser 
} from '../models/user.model.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get all employees (authenticated users)
router.get('/', protect, async (req, res) => {
  try {
    // Se for admin, retorna todos os funcionários
    // Se for funcionário normal, retorna apenas funcionários ativos (não admin)
    const query = req.user.role === 'admin' ? {} : { role: { not: 'admin' } };
    
    const employees = await findUsers(query, {
      orderBy: { name: 'asc' }
    });
      
    // Formata os resultados
    const formattedEmployees = employees.map(emp => ({
      id: emp.id,
      name: emp.name,
      email: emp.email,
      department: emp.department,
      role: emp.role,
      overtimeLimit: emp.overtimeLimit,
      overtimeExceptions: emp.overtimeExceptions || [],
      workSchedule: emp.workSchedule,
      lunchBreakHours: emp.lunchBreakHours,
      lateTolerance: emp.lateTolerance
    }));
      
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
      workSchedule: workSchedule || null,
      lunchBreakHours: lunchBreakHours ? Number(lunchBreakHours) : null,
      lateTolerance: lateTolerance ? Number(lateTolerance) : 10,
    });

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
        workSchedule,
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
      workSchedule: user.workSchedule,
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

// Atualizar limite de horas extras de um funcionário (admin only)
router.patch('/:id/overtime-limit', protect, admin, async (req, res) => {
  try {
    const { overtimeLimit } = req.body;
    
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
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

// Adicionar exceção mensal de horas extras (admin only)
router.post('/:id/overtime-exception', protect, admin, async (req, res) => {
  try {
    const { month, year, additionalHours } = req.body;
    
    if (!month || !year || additionalHours === undefined) {
      return res.status(400).json({ message: 'Mês, ano e horas adicionais são obrigatórios' });
    }

    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
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

// Remover exceção mensal de horas extras (admin only)
router.delete('/:id/overtime-exception/:month/:year', protect, admin, async (req, res) => {
  try {
    const { id, month, year } = req.params;
    
    const user = await findUserById(id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
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
    
    if (!role || !['admin', 'employee'].includes(role)) {
      return res.status(400).json({ message: 'Role inválida. Use "admin" ou "employee"' });
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

    // Verificar se já existe jornada cadastrada
    const hasExistingSchedule = !!user.workSchedule && 
      Object.values(user.workSchedule || {}).some(day => 
        day !== null && day !== undefined && typeof day === 'object' && day.startTime && day.endTime
      );

    logger.info('Estado da jornada atual', {
      employeeId: user.id,
      hasExistingSchedule,
      method: req.method,
      workScheduleExists: !!user.workSchedule,
      workSchedule: user.workSchedule
    });

    // POST: só deve criar se não existir jornada
    if (isPost && hasExistingSchedule) {
      logger.warn('Tentativa de criar jornada que já existe - use PATCH para atualizar', {
        employeeId: user.id,
        hasExistingSchedule
      });
      return res.status(400).json({ 
        message: 'Jornada de trabalho já cadastrada para este funcionário. Use PATCH para atualizar.' 
      });
    }

    // PATCH: só deve atualizar se já existir jornada
    if (isPatch && !hasExistingSchedule) {
      logger.warn('Tentativa de atualizar jornada que não existe - use POST para criar', {
        employeeId: user.id,
        hasExistingSchedule
      });
      return res.status(400).json({ 
        message: 'Jornada de trabalho não cadastrada para este funcionário. Use POST para criar.' 
      });
    }

    const updateData = {};

    // Validar se workSchedule tem pelo menos um dia configurado
    if (workSchedule !== undefined) {
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

      // Verificar se é um objeto válido
      if (typeof parsedWorkSchedule !== 'object' || parsedWorkSchedule === null) {
        logger.warn('workSchedule não é um objeto válido', { 
          employeeId: req.params.id,
          workScheduleType: typeof parsedWorkSchedule,
          workSchedule 
        });
        return res.status(400).json({ 
          message: 'Formato de jornada de trabalho inválido.' 
        });
      }

      const hasAtLeastOneDay = Object.values(parsedWorkSchedule).some(day => 
        day !== null && day !== undefined && typeof day === 'object' && day.startTime && day.endTime
      );
      
      if (!hasAtLeastOneDay) {
        logger.warn('Tentativa de salvar jornada sem dias configurados', { 
          employeeId: req.params.id,
          workSchedule: parsedWorkSchedule 
        });
        return res.status(400).json({ 
          message: 'É necessário configurar pelo menos um dia da semana com horário de trabalho.' 
        });
      }
      
      logger.info('Jornada validada com sucesso', { 
        employeeId: req.params.id,
        daysConfigured: Object.entries(parsedWorkSchedule)
          .filter(([_, day]) => day !== null && day !== undefined && typeof day === 'object' && day.startTime && day.endTime)
          .map(([day, _]) => day)
      });

      // Usar o workSchedule parseado
      updateData.workSchedule = parsedWorkSchedule;
    }

    // Adicionar outros campos
    if (lunchBreakHours !== undefined) updateData.lunchBreakHours = lunchBreakHours ? Number(lunchBreakHours) : null;
    if (lateTolerance !== undefined) updateData.lateTolerance = lateTolerance ? Number(lateTolerance) : 10;

    logger.info('Dados para atualização', { 
      employeeId: req.params.id,
      updateData: {
        hasWorkSchedule: !!updateData.workSchedule,
        workScheduleType: typeof updateData.workSchedule,
        workScheduleString: updateData.workSchedule ? JSON.stringify(updateData.workSchedule) : 'null',
        workScheduleValue: updateData.workSchedule,
        lunchBreakHours: updateData.lunchBreakHours,
        lateTolerance: updateData.lateTolerance,
        updateDataKeys: Object.keys(updateData)
      }
    });

    // Verificar estado atual do usuário antes de atualizar
    logger.info('Estado atual do usuário antes do update', {
      employeeId: user.id,
      hasWorkSchedule: !!user.workSchedule,
      workScheduleType: typeof user.workSchedule,
      workScheduleValue: user.workSchedule
    });

    const updatedUser = await updateUser(user.id, updateData);
    
    // Verificar novamente do banco para confirmar que foi salvo
    const verifiedUser = await findUserById(updatedUser.id);
    
    logger.info(`Jornada ${isPost ? 'criada' : 'atualizada'} com sucesso`, { 
      employeeId: updatedUser.id,
      method: req.method,
      action: isPost ? 'create' : 'update',
      hasWorkSchedule: !!updatedUser.workSchedule,
      workScheduleType: typeof updatedUser.workSchedule,
      workScheduleString: updatedUser.workSchedule ? JSON.stringify(updatedUser.workSchedule) : 'null',
      workSchedule: updatedUser.workSchedule
    });

    logger.info('Verificação pós-salvamento no banco', {
      employeeId: verifiedUser?.id,
      hasWorkSchedule: !!verifiedUser?.workSchedule,
      workScheduleType: typeof verifiedUser?.workSchedule,
      workScheduleString: verifiedUser?.workSchedule ? JSON.stringify(verifiedUser.workSchedule) : 'null',
      workSchedule: verifiedUser?.workSchedule,
      lunchBreakHours: verifiedUser?.lunchBreakHours,
      lateTolerance: verifiedUser?.lateTolerance
    });

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    const action = isPost ? 'Criar' : 'Atualizar';
    // Usando employee_created para ambos os casos até a migration ser aplicada
    // TODO: Usar employee_work_schedule_updated quando a migration for aplicada
    await logAudit({
      action: 'employee_created',
      entityType: 'employee',
      entityId: updatedUser.id,
      userId: req.user.id,
      targetUserId: updatedUser.id,
      description: `Jornada de trabalho ${isPost ? 'criada' : 'atualizada'} para ${updatedUser.name}`,
      metadata: {
        method: req.method,
        action,
        workSchedule,
        lunchBreakHours,
        lateTolerance,
        hadExistingSchedule: hasExistingSchedule
      },
      ...requestMeta
    });

    // Retornar os dados verificados do banco para garantir que está atualizado
    const finalUser = verifiedUser || updatedUser;
    
    res.json({
      id: finalUser.id,
      name: finalUser.name,
      email: finalUser.email,
      department: finalUser.department,
      role: finalUser.role,
      overtimeLimit: finalUser.overtimeLimit,
      overtimeExceptions: finalUser.overtimeExceptions || [],
      workSchedule: finalUser.workSchedule,
      lunchBreakHours: finalUser.lunchBreakHours,
      lateTolerance: finalUser.lateTolerance
    });
  } catch (error) {
    logger.logError(error, { context: 'Atualizar jornada de trabalho', employeeId: req.params.id, userId: req.user?._id });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
};

// Criar ou atualizar jornada de trabalho (admin only)
// POST para criar inicialmente, PATCH para atualizar
router.post('/:id/work-schedule', protect, admin, handleWorkScheduleUpdate);
router.patch('/:id/work-schedule', protect, admin, handleWorkScheduleUpdate);

export default router;
