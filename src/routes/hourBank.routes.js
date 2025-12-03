import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import HourBankRecord from '../models/HourBankRecord.js';
import User from '../models/User.js';
import Overtime from '../models/Overtime.js';
import { CompanySettings } from '../models/companySettings.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import { formatDateForDisplay } from '../utils/dateFormatter.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

const router = express.Router();

// Helper: Calcular saldo do banco de horas
const calculateBalance = async (employeeId) => {
  // Buscar todos os registros (aprovados e pendentes)
  const allRecords = await HourBankRecord.find({
    employeeId
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
  const settings = await CompanySettings.findOne();
  
  return {
    accumulationLimit: settings?.defaultAccumulationLimit || 0,
    usageLimit: settings?.defaultUsageLimit || 0
  };
};

// GET /hour-bank/balance - Buscar saldo do banco de horas
router.get('/balance', protect, async (req, res) => {
  try {
    const targetEmployeeId = req.query.employeeId || req.user._id.toString();
    
    // Se não for admin e tentar buscar de outro funcionário, negar
    if (req.user.role !== 'admin' && targetEmployeeId !== req.user._id.toString()) {
      return res.status(403).json({ 
        error: 'Você não tem permissão para visualizar o saldo de outros funcionários' 
      });
    }

    const employee = await User.findById(targetEmployeeId);
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
    
    let targetEmployeeId = req.user._id.toString();
    
    // Se for admin e forneceu employeeId, usa o fornecido
    if (req.user.role === 'admin' && employeeId) {
      targetEmployeeId = employeeId;
    } else if (req.user.role !== 'admin' && employeeId && employeeId !== req.user._id.toString()) {
      // Funcionário tentando buscar de outro funcionário
      return res.status(403).json({ 
        error: 'Você não tem permissão para visualizar registros de outros funcionários' 
      });
    }

    const query = { employeeId: targetEmployeeId };
    
    if (startDate) {
      query.date = { ...query.date, $gte: startDate };
    }
    if (endDate) {
      query.date = { ...query.date, $lte: endDate };
    }
    if (type && (type === 'credit' || type === 'debit')) {
      query.type = type;
    }
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.status = status;
    }

    const records = await HourBankRecord.find(query)
      .populate('employeeId', 'name email')
      .populate('createdBy', 'name email')
      .populate('overtimeRecordId')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    // Formatar resposta
    const formattedRecords = records.map(record => ({
      id: record._id,
      employeeId: record.employeeId._id || record.employeeId,
      employeeName: record.employeeId?.name || 'N/A',
      date: record.date,
      type: record.type,
      hours: record.hours,
      reason: record.reason,
      overtimeRecordId: record.overtimeRecordId?._id || record.overtimeRecordId || null,
      status: record.status,
      createdBy: record.createdBy?._id || record.createdBy,
      createdByName: record.createdBy?.name || 'N/A',
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
    if (req.user.role !== 'admin' && employeeId !== req.user._id.toString()) {
      return res.status(403).json({ 
        error: 'Você só pode criar crédito para si mesmo' 
      });
    }

    // Verificar se funcionário existe
    const employee = await User.findById(employeeId);
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
    const record = new HourBankRecord({
      employeeId,
      date,
      type: 'credit',
      hours: Number(hours),
      reason,
      overtimeRecordId: overtimeRecordId || null,
      status: 'pending', // Pendente até aprovação
      createdBy: req.user._id
    });

    await record.save();

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'hourbank_credit_created',
      entityType: 'hourbank',
      entityId: record._id,
      userId: req.user._id,
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

    // Popular campos relacionados
    await record.populate('employeeId', 'name email');
    await record.populate('createdBy', 'name email');

    res.status(201).json({
      id: record._id,
      employeeId: record.employeeId._id,
      employeeName: record.employeeId.name,
      date: record.date,
      type: record.type,
      hours: record.hours,
      reason: record.reason,
      overtimeRecordId: record.overtimeRecordId || null,
      status: record.status,
      createdBy: record.createdBy._id,
      createdByName: record.createdBy.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    });
  } catch (error) {
    logger.logError(error, { context: 'Criar crédito no banco de horas', employeeId, userId: req.user?._id });
    res.status(500).json({ error: 'Erro ao criar crédito no banco de horas' });
  }
});

// POST /hour-bank/debit - Criar débito no banco de horas (apenas admin)
router.post('/debit', protect, admin, async (req, res) => {
  try {
    const { employeeId, date, hours, reason } = req.body;

    if (!employeeId || !date || !hours || !reason) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: employeeId, date, hours, reason' 
      });
    }

    // Verificar se funcionário existe
    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
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

      const monthlyDebits = await HourBankRecord.find({
        employeeId,
        type: 'debit',
        status: 'approved',
        date: { $gte: startOfMonth, $lte: endOfMonth }
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
    const record = new HourBankRecord({
      employeeId,
      date,
      type: 'debit',
      hours: Number(hours),
      reason,
      status: 'approved', // Aprovado automaticamente quando criado por admin
      createdBy: req.user._id,
      approvedBy: req.user._id, // Admin que criou já aprova
      approvedAt: new Date()
    });

    await record.save();

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

    // Popular campos relacionados
    await record.populate('employeeId', 'name email');
    await record.populate('createdBy', 'name email');

    res.status(201).json({
      id: record._id,
      employeeId: record.employeeId._id,
      employeeName: record.employeeId.name,
      date: record.date,
      type: record.type,
      hours: record.hours,
      reason: record.reason,
      status: record.status,
      createdBy: record.createdBy._id,
      createdByName: record.createdBy.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    });
  } catch (error) {
    logger.logError(error, { context: 'Criar débito no banco de horas', employeeId, userId: req.user?._id });
    res.status(500).json({ error: 'Erro ao criar débito no banco de horas' });
  }
});

// PATCH /hour-bank/records/:id/status - Aprovar/rejeitar registro (apenas admin)
router.patch('/records/:id/status', protect, admin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        error: 'Status inválido. Use "approved" ou "rejected"' 
      });
    }

    const record = await HourBankRecord.findById(id);
    if (!record) {
      return res.status(404).json({ error: 'Registro não encontrado' });
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
      const balance = await calculateBalance(record.employeeId.toString());
      const limits = await getLimits(record.employeeId.toString());

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

    // Preparar campos de atualização
    const updateData = { status };
    if (status === 'approved') {
      updateData.approvedBy = req.user._id;
      updateData.approvedAt = new Date();
      updateData.rejectedBy = null;
      updateData.rejectedAt = null;
    } else if (status === 'rejected') {
      updateData.rejectedBy = req.user._id;
      updateData.rejectedAt = new Date();
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    }

    // Atualizar registro
    const updatedRecord = await HourBankRecord.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('employeeId', 'name email');

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    const actionName = status === 'approved' ? 'hourbank_approved' : 'hourbank_rejected';
    await logAudit({
      action: actionName,
      entityType: 'hourbank',
      entityId: record._id,
      userId: req.user._id,
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

    // Se está aprovando um débito, verificar saldo disponível
    if (status === 'approved' && record.type === 'debit') {
      const balance = await calculateBalance(record.employeeId.toString());
      if (balance.availableBalance < record.hours) {
        return res.status(400).json({
          error: `Saldo insuficiente. Saldo disponível: ${balance.availableBalance}h, Débito: ${record.hours}h`,
          canProceed: false,
          availableBalance: balance.availableBalance
        });
      }
    }

    // Popular campos relacionados para resposta
    await updatedRecord.populate('createdBy', 'name email');

    res.json({
      id: updatedRecord._id,
      employeeId: updatedRecord.employeeId._id,
      employeeName: updatedRecord.employeeId.name,
      date: updatedRecord.date,
      type: updatedRecord.type,
      hours: updatedRecord.hours,
      reason: updatedRecord.reason,
      status: updatedRecord.status,
      createdBy: updatedRecord.createdBy._id,
      createdByName: updatedRecord.createdBy.name,
      approvedBy: updatedRecord.approvedBy || null,
      rejectedBy: updatedRecord.rejectedBy || null,
      approvedAt: updatedRecord.approvedAt || null,
      rejectedAt: updatedRecord.rejectedAt || null,
      createdAt: updatedRecord.createdAt,
      updatedAt: updatedRecord.updatedAt
    });
  } catch (error) {
    logger.logError(error, { context: 'Atualizar status do registro do banco de horas', recordId: id, userId: req.user?._id });
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

    const targetEmployeeId = employeeId || req.user._id.toString();
    
    // Se não for admin e tentar verificar de outro funcionário, negar
    if (req.user.role !== 'admin' && targetEmployeeId !== req.user._id.toString()) {
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

        const monthlyDebits = await HourBankRecord.find({
          employeeId: targetEmployeeId,
          type: 'debit',
          status: 'approved',
          date: { $gte: startOfMonth, $lte: endOfMonth }
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

