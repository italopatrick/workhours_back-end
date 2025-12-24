import express from 'express';
import { protect, adminOrManager } from '../middleware/auth.js';
import { checkEmployeeDepartment } from '../middleware/departmentAccess.js';
import prisma from '../config/database.js';
import { findUserById } from '../models/user.model.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import logger from '../utils/logger.js';
import { formatDateForDisplay } from '../utils/dateFormatter.js';
import { parseWorkScheduleArray } from '../models/workSchedule.model.js';

const router = express.Router();

// Helper: Criar débito automático no banco de horas quando há horas negativas
const createAutomaticDebit = async (employeeId, date, negativeHours, timeClockId, userId, justification = null) => {
  try {
    // Verificar se já existe débito para este registro de ponto
    const existingDebit = await prisma.hourBankRecord.findFirst({
      where: {
        employeeId,
        date,
        type: 'debit',
        reason: {
          contains: `Registro de ponto ${date}`
        }
      }
    });

    if (existingDebit) {
      logger.info('Débito já existe para este registro de ponto', { timeClockId, existingDebitId: existingDebit.id });
      return existingDebit;
    }

    // Verificar saldo disponível (mas não bloquear se não houver saldo - o débito será criado mesmo assim)
    const allRecords = await prisma.hourBankRecord.findMany({
      where: { employeeId }
    });

    let totalBalance = 0;
    allRecords.forEach(record => {
      if (record.status === 'approved') {
        if (record.type === 'credit') {
          totalBalance += record.hours;
        } else {
          totalBalance -= record.hours;
        }
      }
    });

    // Criar débito no banco de horas automaticamente
    const reasonText = justification 
      ? `Horas não trabalhadas em ${formatDateForDisplay(date)} - ${justification}`
      : `Horas não trabalhadas em ${formatDateForDisplay(date)} (via registro de ponto)`;

    const hourBankDebit = await prisma.hourBankRecord.create({
      data: {
        employeeId,
        date,
        type: 'debit',
        hours: negativeHours,
        reason: reasonText,
        status: 'pending', // Pendente para aprovação manual pelo admin/manager
        createdBy: userId
      }
    });

    // Atualizar o registro de ponto com o ID do débito
    await prisma.timeClock.update({
      where: { id: timeClockId },
      data: { hourBankDebitId: hourBankDebit.id }
    });

    // Registrar log de auditoria
    await logAudit({
      action: 'hourbank_debit_created',
      entityType: 'hourbank',
      entityId: hourBankDebit.id,
      userId: userId,
      targetUserId: employeeId,
      description: `Débito no banco de horas criado automaticamente via registro de ponto: ${negativeHours}h em ${formatDateForDisplay(date)}`,
      metadata: {
        hours: negativeHours,
        date: date,
        type: 'debit',
        timeClockId: timeClockId,
        autoCreated: true,
        justification: justification
      }
    });

    logger.info('Débito no banco de horas criado automaticamente', { 
      timeClockId, 
      employeeId, 
      negativeHours,
      hourBankDebitId: hourBankDebit.id 
    });

    return hourBankDebit;
  } catch (error) {
    logger.logError(error, { 
      context: 'Criar débito automático no banco de horas',
      employeeId,
      date,
      negativeHours
    });
    // Não lançar erro - apenas logar, para não quebrar o fluxo de registro de ponto
    return null;
  }
};

// Helper: Calcular horas trabalhadas
const calculateWorkedHours = (entryTime, exitTime, lunchExitTime, lunchReturnTime, lunchBreakHours = 0) => {
  if (!entryTime || !exitTime) return 0;
  
  const entry = new Date(entryTime);
  const exit = new Date(exitTime);
  
  let totalHours = (exit.getTime() - entry.getTime()) / (1000 * 60 * 60);
  
  // Subtrair almoço se houver
  if (lunchExitTime && lunchReturnTime) {
    const lunchExit = new Date(lunchExitTime);
    const lunchReturn = new Date(lunchReturnTime);
    const lunchDuration = (lunchReturn.getTime() - lunchExit.getTime()) / (1000 * 60 * 60);
    totalHours -= lunchDuration;
  } else {
    // Se não há registro de almoço, subtrair o tempo padrão de almoço
    totalHours -= lunchBreakHours;
  }
  
  return Math.max(0, totalHours);
};

// Helper: Calcular horas extras por almoço não tirado
// Se o funcionário tirou menos almoço que o configurado, a diferença é hora extra
const calculateLunchOvertime = (lunchExitTime, lunchReturnTime, lunchBreakHours) => {
  // Apenas calcular se todos os dados necessários estiverem presentes
  if (!lunchExitTime || !lunchReturnTime || !lunchBreakHours || lunchBreakHours <= 0) {
    return 0;
  }
  
  const lunchExit = new Date(lunchExitTime);
  const lunchReturn = new Date(lunchReturnTime);
  const lunchDuration = (lunchReturn.getTime() - lunchExit.getTime()) / (1000 * 60 * 60);
  
  // Se tirou menos almoço que o configurado, a diferença é hora extra
  // Exemplo: configurado 2h, tirou 1h = 1h extra
  const lunchOvertime = Math.max(0, lunchBreakHours - lunchDuration);
  
  return lunchOvertime;
};

// Helper: Calcular horas agendadas
// Helper: Obter workSchedule da tabela work_schedules (formato atual)
// O campo workSchedule (JSON) no User é legado e pode ser removido
const getWorkSchedule = (employee) => {
  if (!employee) return null;
  
  // Sempre usar a tabela work_schedules (formato atual)
  if (employee.workSchedules && employee.workSchedules.length > 0) {
    return parseWorkScheduleArray(employee.workSchedules);
  }
  
  return null;
};

const calculateScheduledHours = (workSchedule, date, lunchBreakHours = 0) => {
  if (!workSchedule) return 0;
  
  const dayOfWeek = new Date(date).getDay(); // 0 = domingo, 1 = segunda, etc.
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];
  
  const schedule = workSchedule[dayName];
  if (!schedule || !schedule.startTime || !schedule.endTime) return 0;
  
  const start = new Date(`${date}T${schedule.startTime}`);
  const end = new Date(`${date}T${schedule.endTime}`);
  const totalHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  
  return Math.max(0, totalHours - lunchBreakHours);
};

// Helper: Calcular atraso
const calculateLateMinutes = (entryTime, workSchedule, date, lateTolerance = 0) => {
  if (!entryTime || !workSchedule) return 0;
  
  const dayOfWeek = new Date(date).getDay();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];
  
  const schedule = workSchedule[dayName];
  if (!schedule || !schedule.startTime) return 0;
  
  const scheduledStart = new Date(`${date}T${schedule.startTime}`);
  const actualEntry = new Date(entryTime);
  
  const diffMinutes = (actualEntry.getTime() - scheduledStart.getTime()) / (1000 * 60);
  
  return Math.max(0, diffMinutes - lateTolerance);
};

// Helper: Calcular atraso no retorno do almoço
// Se o funcionário retornar após o horário esperado (lunchExitTime + lunchBreakHours), calcula o atraso
const calculateLunchLateMinutes = (lunchExitTime, lunchReturnTime, lunchBreakHours) => {
  if (!lunchExitTime || !lunchReturnTime || !lunchBreakHours || lunchBreakHours <= 0) {
    return 0;
  }
  
  const lunchExit = new Date(lunchExitTime);
  const lunchReturn = new Date(lunchReturnTime);
  
  // Calcular horário esperado de retorno
  const expectedReturn = new Date(lunchExit.getTime() + (lunchBreakHours * 60 * 60 * 1000));
  
  // Calcular diferença em minutos
  const diffMinutes = (lunchReturn.getTime() - expectedReturn.getTime()) / (1000 * 60);
  
  // Retornar apenas se houver atraso (positivo)
  return Math.max(0, diffMinutes);
};

// POST /timeclock/clock-in - Registrar entrada
router.post('/clock-in', protect, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    // Verificar se já existe registro para hoje
    let record = await prisma.timeClock.findFirst({
      where: {
        employeeId,
        date: today
      }
    });
    
    // Se não existe, criar novo registro
    if (!record) {
      record = await prisma.timeClock.create({
        data: {
          employeeId,
          date: today,
          entryTime: new Date()
        }
      });
    } else if (record.entryTime) {
      return res.status(400).json({ 
        error: 'Entrada já registrada para hoje' 
      });
    } else {
      // Atualizar registro existente (pode ser automático)
      record = await prisma.timeClock.update({
        where: { id: record.id },
        data: {
          entryTime: new Date()
        }
      });
    }
    
    // Buscar dados do funcionário para calcular atraso
    const employee = await findUserById(employeeId);
    const workSchedule = getWorkSchedule(employee);
    if (employee && workSchedule) {
      const lateMinutes = calculateLateMinutes(
        record.entryTime,
        workSchedule,
        today,
        employee.lateTolerance || 0
      );
      
      // Se houver atraso, verificar se precisa de justificativa
      if (lateMinutes > 0) {
        try {
          const justifications = await prisma.justification.findMany({
            where: { isActive: true }
          });
          
          if (justifications.length > 0) {
            return res.status(400).json({
              requiresJustification: true,
              justifications: justifications,
              lateMinutes: lateMinutes,
              record: record
            });
          }
        } catch (error) {
          logger.warn('Erro ao buscar justificativas', { error: error.message });
        }
      }
      
      // Atualizar atraso no registro
      if (lateMinutes > 0) {
        record = await prisma.timeClock.update({
          where: { id: record.id },
          data: { lateMinutes: Math.round(lateMinutes) }
        });
      }
    }
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_entry',
      entityType: 'timeclock',
      entityId: record.id,
      userId: req.user.id,
      targetUserId: employeeId,
      description: `Entrada registrada: ${new Date(record.entryTime).toLocaleTimeString('pt-BR')}`,
      metadata: {
        date: today,
        entryTime: record.entryTime
      },
      ...requestMeta
    });
    
    res.json(record);
  } catch (error) {
    logger.logError(error, { context: 'Registrar entrada', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao registrar entrada', error: error.message });
  }
});

// POST /timeclock/clock-out-lunch - Registrar saída para almoço
router.post('/clock-out-lunch', protect, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    const record = await prisma.timeClock.findFirst({
      where: {
        employeeId,
        date: today
      }
    });
    
    if (!record) {
      return res.status(404).json({ error: 'Registro não encontrado. Registre a entrada primeiro.' });
    }
    
    if (!record.entryTime) {
      return res.status(400).json({ error: 'Entrada não registrada' });
    }
    
    if (record.lunchExitTime) {
      return res.status(400).json({ error: 'Saída para almoço já registrada' });
    }
    
    const updatedRecord = await prisma.timeClock.update({
      where: { id: record.id },
      data: {
        lunchExitTime: new Date()
      }
    });
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_lunch_exit',
      entityType: 'timeclock',
      entityId: updatedRecord.id,
      userId: req.user.id,
      targetUserId: employeeId,
      description: `Saída para almoço registrada`,
      metadata: {
        date: today,
        lunchExitTime: updatedRecord.lunchExitTime
      },
      ...requestMeta
    });
    
    res.json(updatedRecord);
  } catch (error) {
    logger.logError(error, { context: 'Registrar saída para almoço', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao registrar saída para almoço', error: error.message });
  }
});

// POST /timeclock/clock-in-lunch - Registrar volta do almoço
router.post('/clock-in-lunch', protect, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    const record = await prisma.timeClock.findFirst({
      where: {
        employeeId,
        date: today
      }
    });
    
    if (!record) {
      return res.status(404).json({ error: 'Registro não encontrado' });
    }
    
    if (!record.lunchExitTime) {
      return res.status(400).json({ error: 'Saída para almoço não registrada' });
    }
    
    if (record.lunchReturnTime) {
      return res.status(400).json({ error: 'Volta do almoço já registrada' });
    }
    
    // Buscar dados do funcionário para obter lunchBreakHours
    const employee = await findUserById(employeeId);
    const lunchBreakHours = employee?.lunchBreakHours || 0;
    
    // Calcular horário de retorno
    const lunchReturnTime = new Date();
    
    // Calcular atraso no retorno do almoço
    const lunchLateMinutes = calculateLunchLateMinutes(
      record.lunchExitTime,
      lunchReturnTime,
      lunchBreakHours
    );
    
    const updatedRecord = await prisma.timeClock.update({
      where: { id: record.id },
      data: {
        lunchReturnTime,
        lunchLateMinutes: lunchLateMinutes > 0 ? Math.round(lunchLateMinutes) : null
      }
    });
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_lunch_return',
      entityType: 'timeclock',
      entityId: updatedRecord.id,
      userId: req.user.id,
      targetUserId: employeeId,
      description: `Volta do almoço registrada`,
      metadata: {
        date: today,
        lunchReturnTime: updatedRecord.lunchReturnTime
      },
      ...requestMeta
    });
    
    res.json(updatedRecord);
  } catch (error) {
    logger.logError(error, { context: 'Registrar volta do almoço', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao registrar volta do almoço', error: error.message });
  }
});

// POST /timeclock/clock-out - Registrar saída
router.post('/clock-out', protect, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    const record = await prisma.timeClock.findFirst({
      where: {
        employeeId,
        date: today
      }
    });
    
    if (!record) {
      return res.status(404).json({ error: 'Registro não encontrado. Registre a entrada primeiro.' });
    }
    
    if (!record.entryTime) {
      return res.status(400).json({ error: 'Entrada não registrada' });
    }
    
    if (record.exitTime) {
      return res.status(400).json({ error: 'Saída já registrada' });
    }
    
    const exitTime = new Date();
    
    // Buscar dados do funcionário
    const employee = await findUserById(employeeId);
    const lunchBreakHours = employee?.lunchBreakHours || 0;
    
    // Calcular horas trabalhadas
    const totalWorkedHours = calculateWorkedHours(
      record.entryTime,
      exitTime,
      record.lunchExitTime,
      record.lunchReturnTime,
      lunchBreakHours
    );
    
    // Obter workSchedule no formato correto
    const workSchedule = getWorkSchedule(employee);
    
    // Calcular horas agendadas
    const scheduledHours = workSchedule 
      ? calculateScheduledHours(workSchedule, today, lunchBreakHours)
      : 0;
    
    // Calcular horas negativas
    const negativeHours = scheduledHours > 0 ? Math.max(0, scheduledHours - totalWorkedHours) : 0;
    
    // Calcular horas extras normais (trabalhou além do horário agendado)
    const normalOvertime = (scheduledHours > 0 && totalWorkedHours > scheduledHours) 
      ? totalWorkedHours - scheduledHours 
      : 0;
    
    // Calcular horas extras por almoço não tirado
    const lunchOvertime = calculateLunchOvertime(
      record.lunchExitTime,
      record.lunchReturnTime,
      lunchBreakHours
    );
    
    // Total de horas extras = horas extras normais + horas extras por almoço
    const overtimeHours = normalOvertime + lunchOvertime;
    
    const updateData = {
      exitTime,
      totalWorkedHours,
      scheduledHours,
      overtimeHours: overtimeHours > 0 ? overtimeHours : null,
      negativeHours: negativeHours > 0 ? negativeHours : null
    };
    
    const updatedRecord = await prisma.timeClock.update({
      where: { id: record.id },
      data: updateData
    });
    
    // Se houver horas negativas, verificar se precisa de justificativa
    if (negativeHours > 0) {
      try {
        const justifications = await prisma.justification.findMany({
          where: { isActive: true }
        });
        
        if (justifications.length > 0) {
          return res.status(400).json({
            requiresJustification: true,
            justifications: justifications,
            negativeHours: negativeHours,
            record: updatedRecord
          });
        }
        
        // Se não há justificativas configuradas, criar débito automaticamente
        await createAutomaticDebit(
          employeeId,
          today,
          negativeHours,
          updatedRecord.id,
          req.user.id
        );
      } catch (error) {
        logger.warn('Erro ao buscar justificativas ou criar débito', { error: error.message });
      }
    }
    
    // Se houver horas extras, criar crédito automaticamente
    if (overtimeHours > 0) {
      try {
        // Verificar se já existe crédito para este registro
        const existingCredit = await prisma.hourBankRecord.findFirst({
          where: {
            employeeId,
            date: today,
            type: 'credit',
            reason: {
              contains: `Registro de ponto ${today}`
            }
          }
        });

        if (!existingCredit) {
          const hourBankCredit = await prisma.hourBankRecord.create({
            data: {
              employeeId,
              date: today,
              type: 'credit',
              hours: overtimeHours,
              reason: `Horas extras trabalhadas em ${formatDateForDisplay(today)} (via registro de ponto)`,
              status: 'pending', // Pendente para aprovação manual pelo admin/manager
              createdBy: req.user.id
            }
          });

          await prisma.timeClock.update({
            where: { id: updatedRecord.id },
            data: { hourBankCreditId: hourBankCredit.id }
          });

          await logAudit({
            action: 'hourbank_credit_created',
            entityType: 'hourbank',
            entityId: hourBankCredit.id,
            userId: req.user.id,
            targetUserId: employeeId,
            description: `Crédito no banco de horas criado automaticamente via registro de ponto: ${overtimeHours}h em ${formatDateForDisplay(today)}`,
            metadata: {
              hours: overtimeHours,
              date: today,
              type: 'credit',
              timeClockId: updatedRecord.id,
              autoCreated: true
            }
          });

          logger.info('Crédito no banco de horas criado automaticamente', { 
            timeClockId: updatedRecord.id, 
            employeeId, 
            overtimeHours 
          });
        }
      } catch (error) {
        logger.warn('Erro ao criar crédito automático', { error: error.message });
      }
    }
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_exit',
      entityType: 'timeclock',
      entityId: updatedRecord.id,
      userId: req.user.id,
      targetUserId: employeeId,
      description: `Saída registrada: ${exitTime.toLocaleTimeString('pt-BR')} - ${totalWorkedHours.toFixed(2)}h trabalhadas`,
      metadata: {
        date: today,
        exitTime,
        totalWorkedHours,
        negativeHours,
        overtimeHours
      },
      ...requestMeta
    });
    
    res.json(updatedRecord);
  } catch (error) {
    logger.logError(error, { context: 'Registrar saída', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao registrar saída', error: error.message });
  }
});

// GET /timeclock/today - Buscar status do ponto de hoje
router.get('/today', protect, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    const record = await prisma.timeClock.findFirst({
      where: {
        employeeId,
        date: today
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
            lateTolerance: true
          }
        }
      }
    });
    
    if (!record) {
      return res.status(404).json({ message: 'Nenhum registro encontrado para hoje' });
    }
    
    res.json(record);
  } catch (error) {
    logger.logError(error, { context: 'Buscar status do ponto de hoje', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao buscar status', error: error.message });
  }
});

// GET /timeclock/my-records - Listar próprios registros
router.get('/my-records', protect, async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const employeeId = req.user.id;
    
    const prismaFilter = {
      employeeId
    };
    
    if (startDate && endDate) {
      prismaFilter.date = {
        gte: startDate,
        lte: endDate
      };
    }
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const [records, total] = await Promise.all([
      prisma.timeClock.findMany({
        where: prismaFilter,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              email: true,
              lateTolerance: true
            }
          }
        },
        orderBy: { date: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.timeClock.count({ where: prismaFilter })
    ]);
    
    res.json({
      records,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.logError(error, { context: 'Buscar meus registros de ponto', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao buscar registros', error: error.message });
  }
});

// GET /timeclock/records/:employeeId - Listar registros de um funcionário (admin/manager)
router.get('/records/:employeeId', protect, adminOrManager, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    
    // Validar acesso por departamento
    const hasAccess = await checkEmployeeDepartment(employeeId, req.user);
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'Acesso negado. Você só pode ver registros de funcionários do seu departamento.' 
      });
    }
    
    const prismaFilter = {
      employeeId
    };
    
    if (startDate && endDate) {
      prismaFilter.date = {
        gte: startDate,
        lte: endDate
      };
    }
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const [records, total] = await Promise.all([
      prisma.timeClock.findMany({
        where: prismaFilter,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              email: true,
              lateTolerance: true
            }
          }
        },
        orderBy: { date: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.timeClock.count({ where: prismaFilter })
    ]);
    
    res.json({
      records,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.logError(error, { context: 'Buscar registros de ponto do funcionário', employeeId: req.params.employeeId, userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao buscar registros', error: error.message });
  }
});

// GET /timeclock/department-records - Listar registros por departamento (manager)
router.get('/department-records', protect, async (req, res) => {
  try {
    const { department, startDate, endDate, page = 1, limit = 20 } = req.query;
    
    // Validar acesso
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Acesso negado' });
    }
    
    // Manager só pode ver seu próprio departamento
    if (req.user.role === 'manager') {
      if (!department || department !== req.user.department) {
        return res.status(403).json({ 
          message: 'Acesso negado. Você só pode ver registros do seu departamento.' 
        });
      }
    }
    
    // Buscar funcionários do departamento
    const departmentEmployees = await prisma.user.findMany({
      where: { department },
      select: { id: true }
    });
    
    if (departmentEmployees.length === 0) {
      return res.json({
        records: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          totalPages: 0
        }
      });
    }
    
    const employeeIds = departmentEmployees.map(emp => emp.id);
    
    const prismaFilter = {
      employeeId: { in: employeeIds }
    };
    
    if (startDate && endDate) {
      prismaFilter.date = {
        gte: startDate,
        lte: endDate
      };
    }
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const [records, total] = await Promise.all([
      prisma.timeClock.findMany({
        where: prismaFilter,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              email: true,
              lateTolerance: true
            }
          }
        },
        orderBy: { date: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.timeClock.count({ where: prismaFilter })
    ]);
    
    res.json({
      records,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.logError(error, { context: 'Buscar registros por departamento', department: req.query.department, userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao buscar registros', error: error.message });
  }
});

// PATCH /timeclock/records/:recordId - Editar registro de ponto (admin/manager)
router.patch('/records/:recordId', protect, adminOrManager, async (req, res) => {
  try {
    const { recordId } = req.params;
    const { entryTime, lunchExitTime, lunchReturnTime, exitTime, justification, justificationId } = req.body;
    
    // Buscar o registro
    const record = await prisma.timeClock.findUnique({
      where: { id: recordId },
      include: {
        employee: {
          select: {
            id: true,
            department: true,
            workSchedules: {    // Tabela normalizada (formato atual)
              select: {
                dayOfWeek: true,
                startTime: true,
                endTime: true,
                isActive: true
              },
              orderBy: {
                dayOfWeek: 'asc'
              }
            },
            lunchBreakHours: true,
            lateTolerance: true
          }
        }
      }
    });
    
    if (!record) {
      return res.status(404).json({ message: 'Registro não encontrado' });
    }
    
    // Validar acesso por departamento
    if (req.user.role === 'manager') {
      if (record.employee.department !== req.user.department) {
        return res.status(403).json({ 
          message: 'Acesso negado. Você só pode editar registros de funcionários do seu departamento.' 
        });
      }
    }
    
    // Preparar dados de atualização
    const updateData = {};
    if (entryTime !== undefined) updateData.entryTime = entryTime ? new Date(entryTime) : null;
    if (lunchExitTime !== undefined) updateData.lunchExitTime = lunchExitTime ? new Date(lunchExitTime) : null;
    if (lunchReturnTime !== undefined) updateData.lunchReturnTime = lunchReturnTime ? new Date(lunchReturnTime) : null;
    if (exitTime !== undefined) updateData.exitTime = exitTime ? new Date(exitTime) : null;
    
    // Processar justificativa: priorizar justificationId, depois justification (texto) para compatibilidade
    if (justificationId !== undefined) {
      if (justificationId === null || justificationId === '') {
        // Remover justificativa
        updateData.justificationId = null;
        updateData.justification = null;
      } else {
        // Buscar justificativa pelo ID
        const justificationRecord = await prisma.justification.findUnique({
          where: { id: justificationId }
        });
        
        if (!justificationRecord || !justificationRecord.isActive) {
          return res.status(400).json({ 
            message: 'Justificativa não encontrada ou inativa.' 
          });
        }
        
        updateData.justificationId = justificationId;
        updateData.justification = justificationRecord.reason;
      }
    } else if (justification !== undefined) {
      // Compatibilidade retroativa: se apenas justification (texto) for fornecido
      updateData.justification = justification;
      // Se houver justificationId no registro atual, manter; caso contrário, limpar
      if (!record.justificationId) {
        updateData.justificationId = null;
      }
    }
    
    // Recalcular valores se houver entrada e saída
    if (updateData.entryTime || updateData.exitTime || entryTime || exitTime) {
      const finalEntryTime = updateData.entryTime || record.entryTime;
      const finalExitTime = updateData.exitTime || record.exitTime;
      const finalLunchExitTime = updateData.lunchExitTime !== undefined ? updateData.lunchExitTime : record.lunchExitTime;
      const finalLunchReturnTime = updateData.lunchReturnTime !== undefined ? updateData.lunchReturnTime : record.lunchReturnTime;
      
      if (finalEntryTime && finalExitTime) {
        const lunchBreakHours = record.employee.lunchBreakHours || 0;
        
        // Calcular horas trabalhadas
        const totalWorkedHours = calculateWorkedHours(
          finalEntryTime,
          finalExitTime,
          finalLunchExitTime,
          finalLunchReturnTime,
          lunchBreakHours
        );
        
        // Obter workSchedule no formato correto
        const workSchedule = getWorkSchedule(record.employee);
        
        // Calcular horas agendadas
        const scheduledHours = workSchedule 
          ? calculateScheduledHours(workSchedule, record.date, lunchBreakHours)
          : 0;
        
        // Calcular horas negativas (apenas se houver horário agendado)
        const negativeHours = scheduledHours > 0 ? Math.max(0, scheduledHours - totalWorkedHours) : 0;
        
        // Calcular horas extras normais (trabalhou além do horário agendado)
        const normalOvertime = (scheduledHours > 0 && totalWorkedHours > scheduledHours) 
          ? totalWorkedHours - scheduledHours 
          : 0;
        
        // Calcular horas extras por almoço não tirado
        const lunchOvertime = calculateLunchOvertime(
          finalLunchExitTime,
          finalLunchReturnTime,
          lunchBreakHours
        );
        
        // Total de horas extras = horas extras normais + horas extras por almoço
        const overtimeHours = normalOvertime + lunchOvertime;
        
        // Calcular atraso no retorno do almoço (se houver registro de almoço)
        const lunchLateMinutes = (finalLunchExitTime && finalLunchReturnTime)
          ? calculateLunchLateMinutes(
              finalLunchExitTime,
              finalLunchReturnTime,
              lunchBreakHours
            )
          : null;
        
        // Calcular atraso
        const lateMinutes = finalEntryTime && workSchedule
          ? calculateLateMinutes(
              finalEntryTime,
              workSchedule,
              record.date,
              record.employee.lateTolerance || 0
            )
          : null;
        
        updateData.totalWorkedHours = totalWorkedHours;
        updateData.scheduledHours = scheduledHours;
        updateData.negativeHours = negativeHours > 0 ? negativeHours : null;
        updateData.overtimeHours = overtimeHours > 0 ? overtimeHours : null;
        updateData.lateMinutes = lateMinutes > 0 ? Math.round(lateMinutes) : null;
        updateData.lunchLateMinutes = lunchLateMinutes > 0 ? Math.round(lunchLateMinutes) : null;
      }
    }
    
    const updatedRecord = await prisma.timeClock.update({
      where: { id: recordId },
      data: updateData,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
            lateTolerance: true
          }
        }
      }
    });
    
    // Se houver horas negativas após a edição, criar/atualizar débito
    if (updatedRecord.negativeHours && updatedRecord.negativeHours > 0) {
      await createAutomaticDebit(
        record.employeeId,
        record.date,
        updatedRecord.negativeHours,
        updatedRecord.id,
        req.user.id,
        updatedRecord.justification || null
      );
    }
    
    // Se houver horas extras após a edição, criar/atualizar crédito
    if (updatedRecord.overtimeHours && updatedRecord.overtimeHours > 0) {
      try {
        const existingCredit = await prisma.hourBankRecord.findFirst({
          where: {
            employeeId: record.employeeId,
            date: record.date,
            type: 'credit',
            reason: {
              contains: `Registro de ponto ${record.date}`
            }
          }
        });

        if (!existingCredit) {
          const hourBankCredit = await prisma.hourBankRecord.create({
            data: {
              employeeId: record.employeeId,
              date: record.date,
              type: 'credit',
              hours: updatedRecord.overtimeHours,
              reason: `Horas extras trabalhadas em ${formatDateForDisplay(record.date)} (via registro de ponto)`,
              status: 'approved',
              createdBy: req.user.id,
              approvedBy: req.user.id,
              approvedAt: new Date()
            }
          });

          await prisma.timeClock.update({
            where: { id: updatedRecord.id },
            data: { hourBankCreditId: hourBankCredit.id }
          });

          await logAudit({
            action: 'hourbank_credit_created',
            entityType: 'hourbank',
            entityId: hourBankCredit.id,
            userId: req.user.id,
            targetUserId: record.employeeId,
            description: `Crédito no banco de horas criado automaticamente via edição de registro de ponto: ${updatedRecord.overtimeHours}h em ${formatDateForDisplay(record.date)}`,
            metadata: {
              hours: updatedRecord.overtimeHours,
              date: record.date,
              type: 'credit',
              timeClockId: updatedRecord.id,
              autoCreated: true
            }
          });
        }
      } catch (error) {
        logger.warn('Erro ao criar crédito automático na edição', { error: error.message });
      }
    }
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_edited',
      entityType: 'timeclock',
      entityId: updatedRecord.id,
      userId: req.user.id,
      targetUserId: record.employeeId,
      description: `Registro de ponto editado: ${record.date}`,
      metadata: {
        date: record.date,
        changes: updateData
      },
      ...requestMeta
    });
    
    res.json(updatedRecord);
  } catch (error) {
    logger.logError(error, { context: 'Editar registro de ponto', recordId: req.params.recordId, userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao editar registro', error: error.message });
  }
});

// POST /timeclock/clock-in-with-justification - Registrar entrada com justificativa
router.post('/clock-in-with-justification', protect, async (req, res) => {
  try {
    const { justificationId, entryTime } = req.body;
    const employeeId = req.user.id;
    const today = entryTime ? new Date(entryTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    
    if (!justificationId) {
      return res.status(400).json({ error: 'Justificativa é obrigatória' });
    }
    
    // Verificar se justificativa existe e está ativa
    const justification = await prisma.justification.findUnique({
      where: { id: justificationId }
    });
    
    if (!justification || !justification.isActive) {
      return res.status(404).json({ error: 'Justificativa não encontrada ou inativa' });
    }
    
    // Verificar se já existe registro para hoje
    let record = await prisma.timeClock.findFirst({
      where: {
        employeeId,
        date: today
      }
    });
    
    const entryDateTime = entryTime ? new Date(entryTime) : new Date();
    
    // Se não existe, criar novo registro
    if (!record) {
      record = await prisma.timeClock.create({
        data: {
          employeeId,
          date: today,
          entryTime: entryDateTime,
          justificationId,
          justification: justification.reason
        }
      });
    } else {
      // Atualizar registro existente
      record = await prisma.timeClock.update({
        where: { id: record.id },
        data: {
          entryTime: entryDateTime,
          justificationId,
          justification: justification.reason
        }
      });
    }
    
    // Buscar dados do funcionário para calcular atraso
    const employee = await findUserById(employeeId);
    const workSchedule = getWorkSchedule(employee);
    if (employee && workSchedule) {
      const lateMinutes = calculateLateMinutes(
        record.entryTime,
        workSchedule,
        today,
        employee.lateTolerance || 0
      );
      
      // Atualizar atraso no registro
      if (lateMinutes > 0) {
        record = await prisma.timeClock.update({
          where: { id: record.id },
          data: { lateMinutes: Math.round(lateMinutes) }
        });
      }
    }
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_entry_with_justification',
      entityType: 'timeclock',
      entityId: record.id,
      userId: req.user.id,
      targetUserId: employeeId,
      description: `Entrada registrada com justificativa: ${justification.reason}`,
      metadata: {
        date: today,
        entryTime: record.entryTime,
        justificationId,
        justification: justification.reason
      },
      ...requestMeta
    });
    
    res.json(record);
  } catch (error) {
    logger.logError(error, { context: 'Registrar entrada com justificativa', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao registrar entrada com justificativa', error: error.message });
  }
});

// POST /timeclock/clock-out-with-justification - Registrar saída com justificativa
router.post('/clock-out-with-justification', protect, async (req, res) => {
  try {
    const { justificationId, exitTime } = req.body;
    const employeeId = req.user.id;
    const today = exitTime ? new Date(exitTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    
    if (!justificationId) {
      return res.status(400).json({ error: 'Justificativa é obrigatória' });
    }
    
    // Verificar se justificativa existe e está ativa
    const justification = await prisma.justification.findUnique({
      where: { id: justificationId }
    });
    
    if (!justification || !justification.isActive) {
      return res.status(404).json({ error: 'Justificativa não encontrada ou inativa' });
    }
    
    const record = await prisma.timeClock.findFirst({
      where: {
        employeeId,
        date: today
      }
    });
    
    if (!record) {
      return res.status(404).json({ error: 'Registro não encontrado. Registre a entrada primeiro.' });
    }
    
    if (!record.entryTime) {
      return res.status(400).json({ error: 'Entrada não registrada' });
    }
    
    if (record.exitTime) {
      return res.status(400).json({ error: 'Saída já registrada' });
    }
    
    const exitDateTime = exitTime ? new Date(exitTime) : new Date();
    
    // Buscar dados do funcionário
    const employee = await findUserById(employeeId);
    const lunchBreakHours = employee?.lunchBreakHours || 0;
    
    // Calcular horas trabalhadas
    const totalWorkedHours = calculateWorkedHours(
      record.entryTime,
      exitDateTime,
      record.lunchExitTime,
      record.lunchReturnTime,
      lunchBreakHours
    );
    
    // Obter workSchedule no formato correto
    const workSchedule = getWorkSchedule(employee);
    
    // Calcular horas agendadas
    const scheduledHours = workSchedule 
      ? calculateScheduledHours(workSchedule, today, lunchBreakHours)
      : 0;
    
    // Calcular horas negativas
    const negativeHours = scheduledHours > 0 ? Math.max(0, scheduledHours - totalWorkedHours) : 0;
    
    // Calcular horas extras normais (trabalhou além do horário agendado)
    const normalOvertime = (scheduledHours > 0 && totalWorkedHours > scheduledHours) 
      ? totalWorkedHours - scheduledHours 
      : 0;
    
    // Calcular horas extras por almoço não tirado
    const lunchOvertime = calculateLunchOvertime(
      record.lunchExitTime,
      record.lunchReturnTime,
      lunchBreakHours
    );
    
    // Total de horas extras = horas extras normais + horas extras por almoço
    const overtimeHours = normalOvertime + lunchOvertime;
    
    // Calcular atraso no retorno do almoço (se houver registro de almoço)
    const lunchLateMinutes = (record.lunchExitTime && record.lunchReturnTime)
      ? calculateLunchLateMinutes(
          record.lunchExitTime,
          record.lunchReturnTime,
          lunchBreakHours
        )
      : null;
    
    const updateData = {
      exitTime: exitDateTime,
      totalWorkedHours,
      scheduledHours,
      overtimeHours: overtimeHours > 0 ? overtimeHours : null,
      negativeHours: negativeHours > 0 ? negativeHours : null,
      lunchLateMinutes: lunchLateMinutes > 0 ? Math.round(lunchLateMinutes) : null,
      justificationId,
      justification: justification.reason
    };
    
    const updatedRecord = await prisma.timeClock.update({
      where: { id: record.id },
      data: updateData
    });
    
    // Se houver horas negativas, criar débito automaticamente (mesmo com justificativa)
    if (negativeHours > 0) {
      await createAutomaticDebit(
        employeeId,
        today,
        negativeHours,
        updatedRecord.id,
        req.user.id,
        justification.reason
      );
    }
    
    // Se houver horas extras, criar crédito automaticamente
    if (overtimeHours > 0) {
      try {
        const existingCredit = await prisma.hourBankRecord.findFirst({
          where: {
            employeeId,
            date: today,
            type: 'credit',
            reason: {
              contains: `Registro de ponto ${today}`
            }
          }
        });

        if (!existingCredit) {
          const hourBankCredit = await prisma.hourBankRecord.create({
            data: {
              employeeId,
              date: today,
              type: 'credit',
              hours: overtimeHours,
              reason: `Horas extras trabalhadas em ${formatDateForDisplay(today)} (via registro de ponto)`,
              status: 'pending', // Pendente para aprovação manual pelo admin/manager
              createdBy: req.user.id
            }
          });

          await prisma.timeClock.update({
            where: { id: updatedRecord.id },
            data: { hourBankCreditId: hourBankCredit.id }
          });

          await logAudit({
            action: 'hourbank_credit_created',
            entityType: 'hourbank',
            entityId: hourBankCredit.id,
            userId: req.user.id,
            targetUserId: employeeId,
            description: `Crédito no banco de horas criado automaticamente via registro de ponto: ${overtimeHours}h em ${formatDateForDisplay(today)}`,
            metadata: {
              hours: overtimeHours,
              date: today,
              type: 'credit',
              timeClockId: updatedRecord.id,
              autoCreated: true
            }
          });
        }
      } catch (error) {
        logger.warn('Erro ao criar crédito automático', { error: error.message });
      }
    }
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_exit_with_justification',
      entityType: 'timeclock',
      entityId: updatedRecord.id,
      userId: req.user.id,
      targetUserId: employeeId,
      description: `Saída registrada com justificativa: ${justification.reason} - ${totalWorkedHours.toFixed(2)}h trabalhadas`,
      metadata: {
        date: today,
        exitTime: exitDateTime,
        totalWorkedHours,
        negativeHours,
        overtimeHours,
        justificationId,
        justification: justification.reason
      },
      ...requestMeta
    });
    
    res.json(updatedRecord);
  } catch (error) {
    logger.logError(error, { context: 'Registrar saída com justificativa', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao registrar saída com justificativa', error: error.message });
  }
});

export default router;

