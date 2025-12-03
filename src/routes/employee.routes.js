import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import User from '../models/User.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get all employees (authenticated users)
router.get('/', protect, async (req, res) => {
  try {
    // Se for admin, retorna todos os funcionários
    // Se for funcionário normal, retorna apenas funcionários ativos (não admin)
    const query = req.user.role === 'admin' ? {} : { role: { $ne: 'admin' } };
    
    const employees = await User.find(query)
      .select('-password')
      .sort({ name: 1 });
      
    // Converte _id para id nos resultados
    const formattedEmployees = employees.map(emp => ({
      id: emp._id,
      name: emp.name,
      email: emp.email,
      department: emp.department,
      role: emp.role,
      overtimeLimit: emp.overtimeLimit,
      overtimeExceptions: emp.overtimeExceptions || []
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
    const { name, email, password, department, role, overtimeLimit } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const user = await User.create({
      name,
      email,
      password,
      department,
      role: role || 'employee',
      overtimeLimit: overtimeLimit || null,
    });

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'employee_created',
      entityType: 'employee',
      entityId: user._id,
      userId: req.user._id,
      targetUserId: user._id,
      description: `Funcionário criado: ${name} (${email})`,
      metadata: {
        name,
        email,
        department,
        role: role || 'employee',
        overtimeLimit: overtimeLimit || null
      },
      ...requestMeta
    });

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      overtimeLimit: user.overtimeLimit,
      overtimeExceptions: user.overtimeExceptions || []
    });
  } catch (error) {
    logger.logError(error, { context: 'Criar funcionário', userId: req.user?._id });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete employee (admin only)
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Não permite deletar o próprio usuário
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    // Registrar log de auditoria antes de deletar
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'employee_deleted',
      entityType: 'employee',
      entityId: user._id,
      userId: req.user._id,
      targetUserId: user._id,
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
    await user.deleteOne();
    
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
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    const oldLimit = user.overtimeLimit;
    
    // Atualiza o limite de horas extras
    user.overtimeLimit = overtimeLimit === null || overtimeLimit === undefined ? null : Number(overtimeLimit);
    await user.save();

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'employee_limit_changed',
      entityType: 'employee',
      entityId: user._id,
      userId: req.user._id,
      targetUserId: user._id,
      description: `Limite de horas extras alterado para ${user.name}: ${oldLimit || 'N/A'}h → ${user.overtimeLimit || 'N/A'}h`,
      metadata: {
        oldLimit: oldLimit || null,
        newLimit: user.overtimeLimit || null
      },
      ...requestMeta
    });

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      overtimeLimit: user.overtimeLimit,
      overtimeExceptions: user.overtimeExceptions || []
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

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Verifica se já existe uma exceção para este mês/ano
    const existingExceptionIndex = user.overtimeExceptions?.findIndex(
      e => e.month === Number(month) && e.year === Number(year)
    );

    if (existingExceptionIndex >= 0) {
      // Atualiza a exceção existente
      if (!user.overtimeExceptions) {
        user.overtimeExceptions = [];
      }
      user.overtimeExceptions[existingExceptionIndex].additionalHours = Number(additionalHours);
    } else {
      // Adiciona nova exceção
      if (!user.overtimeExceptions) {
        user.overtimeExceptions = [];
      }
      user.overtimeExceptions.push({
        month: Number(month),
        year: Number(year),
        additionalHours: Number(additionalHours)
      });
    }

    await user.save();

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'employee_exception_added',
      entityType: 'employee',
      entityId: user._id,
      userId: req.user._id,
      targetUserId: user._id,
      description: `Exceção de horas extras adicionada para ${user.name}: ${additionalHours}h extras em ${month}/${year}`,
      metadata: {
        month: Number(month),
        year: Number(year),
        additionalHours: Number(additionalHours),
        isUpdate: existingExceptionIndex >= 0
      },
      ...requestMeta
    });

    res.json({
      id: user._id,
      name: user.name,
      overtimeLimit: user.overtimeLimit,
      overtimeExceptions: user.overtimeExceptions
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
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Remove a exceção para este mês/ano
    if (user.overtimeExceptions && user.overtimeExceptions.length > 0) {
      user.overtimeExceptions = user.overtimeExceptions.filter(
        e => !(e.month === Number(month) && e.year === Number(year))
      );
      await user.save();

      // Registrar log de auditoria
      const requestMeta = getRequestMetadata(req);
      await logAudit({
        action: 'employee_exception_removed',
        entityType: 'employee',
        entityId: user._id,
        userId: req.user._id,
        targetUserId: user._id,
        description: `Exceção de horas extras removida para ${user.name}: mês ${month}/${year}`,
        metadata: {
          month: Number(month),
          year: Number(year)
        },
        ...requestMeta
      });
    }

    res.json({
      id: user._id,
      name: user.name,
      overtimeLimit: user.overtimeLimit,
      overtimeExceptions: user.overtimeExceptions
    });
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

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Não permite alterar a própria role
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Você não pode alterar sua própria função' });
    }

    const oldRole = user.role;

    // Atualiza a role
    user.role = role;
    await user.save();

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'employee_role_changed',
      entityType: 'employee',
      entityId: user._id,
      userId: req.user._id,
      targetUserId: user._id,
      description: `Role alterada para ${user.name}: ${oldRole} → ${role}`,
      metadata: {
        oldRole,
        newRole: role
      },
      ...requestMeta
    });

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      overtimeLimit: user.overtimeLimit,
      overtimeExceptions: user.overtimeExceptions || []
    });
  } catch (error) {
    logger.logError(error, { context: 'Atualizar role do funcionário', employeeId: req.params.id, userId: req.user?._id });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

export default router;
