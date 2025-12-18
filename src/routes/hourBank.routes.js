import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { findUserById } from '../models/user.model.js';
import { getOrCreateSettings } from '../models/companySettings.model.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import { formatDateForDisplay } from '../utils/dateFormatter.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Helper: Calcular saldo do banco de horas
const calculateBalance = async (employeeId) => {
  // Buscar todos os registros (aprovados e pendentes)
  const allRecords = await prisma.hourBankRecord.findMany({
    where: {
      employeeId
    }
  });

  let totalBalance = 0;
  let pendingCredit = 0;
  let pendingDebit = 0;

  allRecords.forEach(record => {
    if (record.status === 'pending') {
      if (record.type === 'credit') {
        pendingCredit += record.hours;
      } else {
        pendingDebit += record.hours;
      }
    } else if (record.status === 'approved') {
      if (record.type === 'credit') {
        totalBalance += record.hours;
      } else {
        totalBalance -= record.hours;
      }
    }
  });

  const availableBalance = totalBalance;

  return {
    totalBalance,
    availableBalance,
    pendingCredit,
    pendingDebit
  };
};

// Helper: Buscar limites
const getLimits = async (employeeId) => {
  const settings = await getOrCreateSettings();
  
  return {
    accumulationLimit: settings?.defaultAccumulationLimit || 0,
    usageLimit: settings?.defaultUsageLimit || 0
  };
};

// GET /hour-bank/balance - Buscar saldo do banco de horas
router.get('/balance', protect, async (req, res) => {
  try {
    const targetEmployeeId = req.query.employeeId || req.user.id;
    
    // Validar acesso baseado na role
    if (req.user.role === 'employee' && targetEmployeeId !== req.user.id) {
      return res.status(403).json({ 
        error: 'Você não tem permissão para visualizar o saldo de outros funcionários' 
      });
    }
    
    // Se for manager, verificar se o funcionário pertence ao seu departamento
    if (req.user.role === 'manager' && targetEmployeeId !== req.user.id) {
      const employee = await findUserById(targetEmployeeId);
      if (!employee || employee.department !== req.user.department) {
        return res.status(403).json({ 
          error: 'Acesso negado. Você só pode visualizar saldos de funcionários do seu departamento.' 
        });
      }
    }

    const employee = await findUserById(targetEmployeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    const balance = await calculateBalance(targetEmployeeId);
    const limits = await getLimits(targetEmployeeId);

    // Calcular percentuais
    const accumulationLimitPercentage = limits.accumulationLimit > 0
      ? (balance.totalBalance / limits.accumulationLimit) * 100
      : 0;
    
    const usageLimitPercentage = limits.usageLimit > 0
      ? (balance.availableBalance / limits.usageLimit) * 100
      : 0;

    res.json({
      employeeId: targetEmployeeId,
      employeeName: employee.name,
      totalBalance: balance.totalBalance,
      availableBalance: balance.availableBalance,
      pendingCredit: balance.pendingCredit,
      pendingDebit: balance.pendingDebit,
      accumulationLimit: limits.accumulationLimit,
      usageLimit: limits.usageLimit,
      accumulationLimitPercentage: Math.min(100, Math.max(0, accumulationLimitPercentage)),
      usageLimitPercentage: Math.min(100, Math.max(0, usageLimitPercentage))
    });
  } catch (error) {
    logger.logError(error, { context: 'Buscar saldo do banco de horas', employeeId: req.query.employeeId });
    res.status(500).json({ error: 'Erro ao buscar saldo do banco de horas' });
  }
});

// GET /hour-bank/records - Buscar histórico de registros
router.get('/records', protect, async (req, res) => {
  try {
    const { employeeId, startDate, endDate, type, status } = req.query;
    
    const prismaQuery = {};
    let useEmployeeIdFilter = true;
    let targetEmployeeId = req.user.id;
    
    // Determinar employeeId baseado na role
    if (req.user.role === 'admin') {
      // Admin pode ver qualquer funcionário
      if (employeeId) {
        targetEmployeeId = employeeId;
      }
    } else if (req.user.role === 'manager') {
      // Manager pode ver funcionários do departamento
      if (employeeId) {
        // Validar se o funcionário pertence ao departamento do manager
        const employee = await findUserById(employeeId);
        if (!employee) {
          return res.status(404).json({ error: 'Funcionário não encontrado' });
        }
        if (employee.department !== req.user.department) {
          return res.status(403).json({ 
            error: 'Acesso negado. Você só pode visualizar registros de funcionários do seu departamento.' 
          });
        }
        targetEmployeeId = employeeId;
      } else {
        // Sem employeeId específico, filtrar por departamento
        const departmentEmployees = await prisma.user.findMany({
          where: { department: req.user.department },
          select: { id: true }
        });
        const employeeIds = departmentEmployees.map(emp => emp.id);
        // Modificar a query para usar IN
        if (employeeIds.length > 0) {
          prismaQuery.employeeId = { in: employeeIds };
          useEmployeeIdFilter = false; // Já definido acima
        } else {
          // Se não há funcionários no departamento, retornar vazio
          return res.json([]);
        }
      }
    } else if (req.user.role === 'employee') {
      // Employee só vê próprios registros
      if (employeeId && employeeId !== req.user.id) {
        return res.status(403).json({ 
          error: 'Você não tem permissão para visualizar registros de outros funcionários' 
        });
      }
    }
    
    // Definir employeeId apenas se não foi definido acima (manager sem employeeId)
    if (useEmployeeIdFilter) {
      prismaQuery.employeeId = targetEmployeeId;
    }
    
    if (startDate) {
      prismaQuery.date = { ...prismaQuery.date, gte: startDate };
    }
    if (endDate) {
      prismaQuery.date = { ...prismaQuery.date, lte: endDate };
    }
    if (type && (type === 'credit' || type === 'debit')) {
      prismaQuery.type = type;
    }
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      prismaQuery.status = status;
    }

    const records = await prisma.hourBankRecord.findMany({
      where: prismaQuery,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        overtimeRecord: true
      },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    // Formatar resposta
    const formattedRecords = records.map(record => ({
      id: record.id,
      employeeId: record.employee?.id || record.employeeId,
      employeeName: record.employee?.name || 'N/A',
      date: record.date,
      type: record.type,
      hours: record.hours,
      reason: record.reason,
      overtimeRecordId: record.overtimeRecord?.id || record.overtimeRecordId || null,
      status: record.status,
      createdBy: record.creator?.id || record.createdBy,
      createdByName: record.creator?.name || 'N/A',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }));

    res.json(formattedRecords);
  } catch (error) {
    logger.logError(error, { context: 'Buscar registros do banco de horas', employeeId: req.query.employeeId });
    res.status(500).json({ error: 'Erro ao buscar registros do banco de horas' });
  }
});

// POST /hour-bank/credit - Criar crédito no banco de horas
router.post('/credit', protect, async (req, res) => {
  try {
    const { employeeId, date, hours, reason, overtimeRecordId } = req.body;

    if (!employeeId || !date || !hours || !reason) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: employeeId, date, hours, reason' 
      });
    }

    // Validar se o usuário tem permissão
    if (req.user.role === 'employee' && employeeId !== req.user.id) {
      return res.status(403).json({ 
        error: 'Você só pode criar crédito para si mesmo' 
      });
    }
    
    // Se for manager, verificar se o funcionário pertence ao seu departamento
    if (req.user.role === 'manager' && employeeId !== req.user.id) {
      const employee = await findUserById(employeeId);
      if (!employee || employee.department !== req.user.department) {
        return res.status(403).json({ 
          error: 'Acesso negado. Você só pode criar crédito para funcionários do seu departamento.' 
        });
      }
    }

    // Verificar se funcionário existe
    const employee = await findUserById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Validar limites antes de criar
    const balance = await calculateBalance(employeeId);
    const limits = await getLimits(employeeId);

    // Verificar limite de acúmulo
    if (limits.accumulationLimit > 0) {
      const totalAfterCredit = balance.totalBalance + hours;
      if (totalAfterCredit > limits.accumulationLimit) {
        return res.status(400).json({
          error: `Limite de acúmulo excedido. Saldo atual: ${balance.totalBalance}h, Limite: ${limits.accumulationLimit}h`,
          canProceed: false,
          currentBalance: balance.totalBalance,
          limit: limits.accumulationLimit,
          requested: hours
        });
      }
    }

    // Criar registro de crédito
    const record = await prisma.hourBankRecord.create({
      data: {
        employeeId,
        date,
        type: 'credit',
        hours: Number(hours),
        reason,
        overtimeRecordId: overtimeRecordId || null,
        status: 'pending', // Pendente até aprovação
        createdBy: req.user.id
      }
    });

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'hourbank_credit_created',
      entityType: 'hourbank',
      entityId: record.id,
      userId: req.user.id,
      targetUserId: employeeId,
      description: `Crédito no banco de horas criado: ${hours}h em ${formatDateForDisplay(date)}`,
      metadata: {
        hours,
        date,
        type: 'credit',
        overtimeRecordId: overtimeRecordId || null
      },
      ...requestMeta
    });

    // Buscar campos relacionados (já foi feito acima)
    res.status(201).json({
      id: recordWithRelations.id,
      employeeId: recordWithRelations.employee.id,
      employeeName: recordWithRelations.employee.name,
      date: recordWithRelations.date,
      type: recordWithRelations.type,
      hours: recordWithRelations.hours,
      reason: recordWithRelations.reason,
      overtimeRecordId: recordWithRelations.overtimeRecordId || null,
      status: recordWithRelations.status,
      createdBy: recordWithRelations.creator.id,
      createdByName: recordWithRelations.creator.name,
      createdAt: recordWithRelations.createdAt,
      updatedAt: recordWithRelations.updatedAt
    });
  } catch (error) {
    logger.logError(error, { context: 'Criar crédito no banco de horas', employeeId, userId: req.user?.id });
    res.status(500).json({ error: 'Erro ao criar crédito no banco de horas' });
  }
});

// POST /hour-bank/debit - Criar débito no banco de horas (admin ou manager)
router.post('/debit', protect, async (req, res) => {
  try {
    // Verificar se é admin ou manager
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Acesso negado: apenas administradores e gestores' });
    }

    const { employeeId, date, hours, reason } = req.body;

    if (!employeeId || !date || !hours || !reason) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: employeeId, date, hours, reason' 
      });
    }

    // Verificar se funcionário existe
    const employee = await findUserById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Se for manager, verificar se o funcionário pertence ao seu departamento
    if (req.user.role === 'manager' && employee.department !== req.user.department) {
      return res.status(403).json({ 
        error: 'Acesso negado. Você só pode criar débito para funcionários do seu departamento.' 
      });
    }

    // Verificar saldo disponível
    const balance = await calculateBalance(employeeId);
    if (balance.availableBalance < hours) {
      return res.status(400).json({
        error: `Saldo insuficiente. Saldo disponível: ${balance.availableBalance}h, Solicitado: ${hours}h`,
        canProceed: false,
        availableBalance: balance.availableBalance,
        requested: hours
      });
    }

    // Verificar limite de uso por período (mensal)
    const limits = await getLimits(employeeId);
    if (limits.usageLimit > 0) {
      const [year, month] = date.split('-');
      const startOfMonth = `${year}-${month.padStart(2, '0')}-01`;
      const endOfMonth = `${year}-${month.padStart(2, '0')}-31`;

      const monthlyDebits = await prisma.hourBankRecord.findMany({
        where: {
          employeeId,
          type: 'debit',
          status: 'approved',
          date: { gte: startOfMonth, lte: endOfMonth }
        }
      });

      const totalMonthlyDebit = monthlyDebits.reduce((sum, record) => sum + record.hours, 0);
      
      if (totalMonthlyDebit + hours > limits.usageLimit) {
        return res.status(400).json({
          error: `Limite de uso mensal excedido. Uso atual no mês: ${totalMonthlyDebit}h, Limite: ${limits.usageLimit}h`,
          canProceed: false,
          monthlyUsage: totalMonthlyDebit,
          limit: limits.usageLimit,
          requested: hours
        });
      }
    }

    // Criar registro de débito (automaticamente aprovado quando criado por admin)
    const record = await prisma.hourBankRecord.create({
      data: {
        employeeId,
        date,
        type: 'debit',
        hours: Number(hours),
        reason,
        status: 'approved', // Aprovado automaticamente quando criado por admin
        createdBy: req.user.id,
        approvedBy: req.user.id, // Admin que criou já aprova
        approvedAt: new Date()
      }
    });

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'hourbank_debit_created',
      entityType: 'hourbank',
      entityId: record._id,
      userId: req.user._id,
      targetUserId: employeeId,
      description: `Débito/compensação no banco de horas criado: ${hours}h em ${formatDateForDisplay(date)} - ${reason}`,
      metadata: {
        hours,
        date,
        type: 'debit',
        reason
      },
      ...requestMeta
    });

    // Buscar campos relacionados
    const recordWithRelations = await prisma.hourBankRecord.findUnique({
      where: { id: record.id },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(201).json({
      id: recordWithRelations.id,
      employeeId: recordWithRelations.employee.id,
      employeeName: recordWithRelations.employee.name,
      date: recordWithRelations.date,
      type: recordWithRelations.type,
      hours: recordWithRelations.hours,
      reason: recordWithRelations.reason,
      status: recordWithRelations.status,
      createdBy: recordWithRelations.creator.id,
      createdByName: recordWithRelations.creator.name,
      createdAt: recordWithRelations.createdAt,
      updatedAt: recordWithRelations.updatedAt
    });
  } catch (error) {
    logger.logError(error, { context: 'Criar débito no banco de horas', employeeId, userId: req.user?.id });
    res.status(500).json({ error: 'Erro ao criar débito no banco de horas' });
  }
});

// PATCH /hour-bank/records/:id/status - Aprovar/rejeitar registro (admin ou manager)
router.patch('/records/:id/status', protect, async (req, res) => {
  try {
    // Verificar se é admin ou manager
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Acesso negado: apenas administradores e gestores' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        error: 'Status inválido. Use "approved" ou "rejected"' 
      });
    }

    // Buscar o registro para validar acesso
    const record = await prisma.hourBankRecord.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            department: true
          }
        }
      }
    });

    if (!record) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }

    // Se for manager, verificar se o funcionário pertence ao seu departamento
    if (req.user.role === 'manager' && record.employee.department !== req.user.department) {
      return res.status(403).json({ 
        error: 'Acesso negado. Você só pode aprovar registros de funcionários do seu departamento.' 
      });
    }

    const oldStatus = record.status;

    // Apenas registros pendentes podem ser aprovados/rejeitados
    if (record.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Apenas registros pendentes podem ser aprovados ou rejeitados' 
      });
    }

    // Se está aprovando um crédito, verificar limite de acúmulo
    if (status === 'approved' && record.type === 'credit') {
      const balance = await calculateBalance(record.employeeId);
      const limits = await getLimits(record.employeeId);

      if (limits.accumulationLimit > 0) {
        const totalAfterApproval = balance.totalBalance + record.hours;
        if (totalAfterApproval > limits.accumulationLimit) {
          return res.status(400).json({
            error: `Limite de acúmulo excedido. Saldo atual: ${balance.totalBalance}h, Limite: ${limits.accumulationLimit}h`,
            canProceed: false,
            currentBalance: balance.totalBalance,
            limit: limits.accumulationLimit
          });
        }
      }
    }

    // Se está aprovando um débito, permitir saldo negativo
    // (com a nova implementação, débitos podem resultar em saldo negativo)
    // Apenas logar o saldo após aprovação, mas não bloquear
    if (status === 'approved' && record.type === 'debit') {
      const balance = await calculateBalance(record.employeeId);
      const balanceAfterDebit = balance.availableBalance - record.hours;
      
      if (balanceAfterDebit < 0) {
        logger.info('Aprovando débito que resultará em saldo negativo', {
          employeeId: record.employeeId,
          recordId: record.id,
          currentBalance: balance.availableBalance,
          debitHours: record.hours,
          balanceAfterDebit
        });
      }
    }

    // Preparar campos de atualização
    const updateData = { status };
    if (status === 'approved') {
      updateData.approvedBy = req.user.id;
      updateData.approvedAt = new Date();
      updateData.rejectedBy = null;
      updateData.rejectedAt = null;
    } else if (status === 'rejected') {
      updateData.rejectedBy = req.user.id;
      updateData.rejectedAt = new Date();
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    }

    // Atualizar registro
    const updatedRecord = await prisma.hourBankRecord.update({
      where: { id },
      data: updateData,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    const actionName = status === 'approved' ? 'hourbank_approved' : 'hourbank_rejected';
    await logAudit({
      action: actionName,
      entityType: 'hourbank',
        entityId: record.id,
        userId: req.user.id,
        targetUserId: record.employeeId,
      description: `Registro de banco de horas ${status === 'approved' ? 'aprovado' : 'rejeitado'}: ${record.hours}h (${record.type}) em ${formatDateForDisplay(record.date)}`,
      metadata: {
        hours: record.hours,
        date: record.date,
        type: record.type,
        previousStatus: oldStatus,
        newStatus: status
      },
      ...requestMeta
    });

    // Buscar campos relacionados para resposta
    const recordWithCreator = await prisma.hourBankRecord.findUnique({
      where: { id: updatedRecord.id },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      id: updatedRecord.id,
      employeeId: updatedRecord.employee.id,
      employeeName: updatedRecord.employee.name,
      date: updatedRecord.date,
      type: updatedRecord.type,
      hours: updatedRecord.hours,
      reason: updatedRecord.reason,
      status: updatedRecord.status,
      createdBy: recordWithCreator.creator.id,
      createdByName: recordWithCreator.creator.name,
      approvedBy: updatedRecord.approvedBy || null,
      rejectedBy: updatedRecord.rejectedBy || null,
      approvedAt: updatedRecord.approvedAt || null,
      rejectedAt: updatedRecord.rejectedAt || null,
      createdAt: updatedRecord.createdAt,
      updatedAt: updatedRecord.updatedAt
    });
  } catch (error) {
    logger.logError(error, { context: 'Atualizar status do registro do banco de horas', recordId: id, userId: req.user?.id });
    res.status(500).json({ error: 'Erro ao atualizar status do registro' });
  }
});

// GET /hour-bank/limits - Verificar limites antes de criar registro
router.get('/limits', protect, async (req, res) => {
  try {
    const { employeeId, hours, type } = req.query;
    
    if (!employeeId || !hours || !type) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: employeeId, hours, type' 
      });
    }

    if (!['credit', 'debit'].includes(type)) {
      return res.status(400).json({ 
        error: 'Tipo inválido. Use "credit" ou "debit"' 
      });
    }

    const targetEmployeeId = employeeId || req.user.id;
    
    // Se não for admin e tentar verificar de outro funcionário, negar
    if (req.user.role !== 'admin' && targetEmployeeId !== req.user.id) {
      return res.status(403).json({ 
        error: 'Você não tem permissão para verificar limites de outros funcionários' 
      });
    }

    const balance = await calculateBalance(targetEmployeeId);
    const limits = await getLimits(targetEmployeeId);
    const hoursNum = Number(hours);

    let canProceed = true;
    let message = '';

    if (type === 'credit') {
      // Verificar limite de acúmulo
      if (limits.accumulationLimit > 0) {
        const totalAfterCredit = balance.totalBalance + hoursNum;
        if (totalAfterCredit > limits.accumulationLimit) {
          canProceed = false;
          message = `Limite de acúmulo seria excedido. Saldo atual: ${balance.totalBalance}h, Limite: ${limits.accumulationLimit}h`;
        }
      }
    } else if (type === 'debit') {
      // Verificar saldo disponível
      if (balance.availableBalance < hoursNum) {
        canProceed = false;
        message = `Saldo insuficiente. Saldo disponível: ${balance.availableBalance}h, Solicitado: ${hoursNum}h`;
      }

      // Verificar limite de uso mensal (se data for fornecida)
      if (limits.usageLimit > 0 && req.query.date) {
        const [year, month] = req.query.date.split('-');
        const startOfMonth = `${year}-${month.padStart(2, '0')}-01`;
        const endOfMonth = `${year}-${month.padStart(2, '0')}-31`;

        const monthlyDebits = await prisma.hourBankRecord.findMany({
          where: {
            employeeId: targetEmployeeId,
            type: 'debit',
            status: 'approved',
            date: { gte: startOfMonth, lte: endOfMonth }
          }
        });

        const totalMonthlyDebit = monthlyDebits.reduce((sum, record) => sum + record.hours, 0);
        
        if (totalMonthlyDebit + hoursNum > limits.usageLimit) {
          canProceed = false;
          message = `Limite de uso mensal seria excedido. Uso atual no mês: ${totalMonthlyDebit}h, Limite: ${limits.usageLimit}h`;
        }
      }
    }

    res.json({
      canProceed,
      message: message || 'Limites verificados. Operação permitida.',
      currentBalance: balance.totalBalance,
      availableBalance: balance.availableBalance,
      limits: {
        accumulationLimit: limits.accumulationLimit,
        usageLimit: limits.usageLimit
      }
    });
  } catch (error) {
    logger.logError(error, { context: 'Verificar limites do banco de horas', employeeId: req.query.employeeId });
    res.status(500).json({ error: 'Erro ao verificar limites' });
  }
});

export default router;

