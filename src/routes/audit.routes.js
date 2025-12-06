import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import prisma from '../config/database.js';
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

    // Construir query do Prisma
    const prismaQuery = {};
    if (action) prismaQuery.action = action;
    if (entityType) prismaQuery.entityType = entityType;
    if (userId) prismaQuery.userId = userId;
    if (targetUserId) prismaQuery.targetUserId = targetUserId;

    // Filtro por data
    if (startDate || endDate) {
      prismaQuery.createdAt = {};
      if (startDate) {
        prismaQuery.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // Adiciona 1 dia e subtrai 1ms para incluir o dia inteiro
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        prismaQuery.createdAt.lte = end;
      }
    }

    // Paginação
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const pageLimit = parseInt(limit);

    // Buscar logs com include dos usuários
    const logs = await prisma.auditLog.findMany({
      where: prismaQuery,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        targetUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageLimit
    });

    // Contar total de registros
    const total = await prisma.auditLog.count({ where: prismaQuery });

    // Formatar resposta
    const formattedLogs = logs.map(log => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      userId: log.user?.id || log.userId,
      userName: log.user?.name || 'Usuário não encontrado',
      userEmail: log.user?.email || '',
      userRole: log.user?.role || '',
      targetUserId: log.targetUser?.id || log.targetUserId || null,
      targetUserName: log.targetUser?.name || null,
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
    logger.logError(error, { context: 'Buscar logs de auditoria', userId: req.user?.id });
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

