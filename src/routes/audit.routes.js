import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /audit/logs - Listar logs de auditoria (apenas admin)
router.get('/logs', protect, admin, async (req, res) => {
  try {
    const {
      action,
      entityType,
      userId,
      targetUserId,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    // Construir query
    const query = {};

    if (action) {
      query.action = action;
    }

    if (entityType) {
      query.entityType = entityType;
    }

    if (userId) {
      query.userId = userId;
    }

    if (targetUserId) {
      query.targetUserId = targetUserId;
    }

    // Filtro por data
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        // Adiciona 1 dia e subtrai 1ms para incluir o dia inteiro
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Paginação
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const pageLimit = parseInt(limit);

    // Buscar logs com populate dos usuários
    const logs = await AuditLog.find(query)
      .populate('userId', 'name email role')
      .populate('targetUserId', 'name email')
      .sort({ createdAt: -1 }) // Mais recentes primeiro
      .skip(skip)
      .limit(pageLimit)
      .lean();

    // Contar total de registros
    const total = await AuditLog.countDocuments(query);

    // Formatar resposta
    const formattedLogs = logs.map(log => ({
      id: log._id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      userId: log.userId?._id || log.userId,
      userName: log.userId?.name || 'Usuário não encontrado',
      userEmail: log.userId?.email || '',
      userRole: log.userId?.role || '',
      targetUserId: log.targetUserId?._id || log.targetUserId || null,
      targetUserName: log.targetUserId?.name || null,
      description: log.description,
      metadata: log.metadata || {},
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt
    }));

    res.json({
      logs: formattedLogs,
      pagination: {
        page: parseInt(page),
        limit: pageLimit,
        total,
        totalPages: Math.ceil(total / pageLimit)
      }
    });
  } catch (error) {
    logger.logError(error, { context: 'Buscar logs de auditoria', userId: req.user?._id });
    res.status(500).json({ error: 'Erro ao buscar logs de auditoria' });
  }
});

// GET /audit/actions - Listar ações disponíveis para filtro
router.get('/actions', protect, admin, async (req, res) => {
  try {
    const actions = [
      // Horas extras
      { value: 'overtime_created', label: 'Hora Extra Criada' },
      { value: 'overtime_approved', label: 'Hora Extra Aprovada' },
      { value: 'overtime_rejected', label: 'Hora Extra Rejeitada' },
      // Banco de horas
      { value: 'hourbank_credit_created', label: 'Crédito Banco de Horas Criado' },
      { value: 'hourbank_debit_created', label: 'Débito Banco de Horas Criado' },
      { value: 'hourbank_approved', label: 'Registro Banco de Horas Aprovado' },
      { value: 'hourbank_rejected', label: 'Registro Banco de Horas Rejeitado' },
      // Funcionários
      { value: 'employee_created', label: 'Funcionário Criado' },
      { value: 'employee_deleted', label: 'Funcionário Excluído' },
      { value: 'employee_role_changed', label: 'Role do Funcionário Alterada' },
      { value: 'employee_limit_changed', label: 'Limite de Horas Alterado' },
      { value: 'employee_exception_added', label: 'Exceção de Horas Adicionada' },
      { value: 'employee_exception_removed', label: 'Exceção de Horas Removida' },
      // Configurações
      { value: 'settings_updated', label: 'Configurações Atualizadas' },
      { value: 'settings_logo_updated', label: 'Logo Atualizada' }
    ];

    res.json(actions);
  } catch (error) {
    logger.logError(error, { context: 'Buscar ações de auditoria' });
    res.status(500).json({ error: 'Erro ao buscar ações de auditoria' });
  }
});

export default router;

