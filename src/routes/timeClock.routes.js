import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { findUserById } from '../models/user.model.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import { sendTimeClockEmail } from '../services/emailService.js';
import {
  calculateWorkedHours,
  calculateLateMinutes,
  calculateOvertimeHours,
  getWorkScheduleForDay,
  getScheduledHoursForDay,
  formatDateString
} from '../utils/timeClockUtils.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Helper: Get or create time clock record for today
async function getOrCreateTimeClockRecord(employeeId, date) {
  const existingRecord = await prisma.timeClock.findUnique({
    where: {
      employeeId_date: {
        employeeId,
        date
      }
    }
  });

  if (existingRecord) {
    return existingRecord;
  }

  return await prisma.timeClock.create({
    data: {
      employeeId,
      date
    }
  });
}

// Helper: Calculate balance for hour bank
async function calculateHourBankBalance(employeeId) {
  const allRecords = await prisma.hourBankRecord.findMany({
    where: {
      employeeId,
      status: 'approved'
    }
  });

  let balance = 0;
  allRecords.forEach(record => {
    if (record.type === 'credit') {
      balance += record.hours;
    } else {
      balance -= record.hours;
    }
  });

  return balance;
}

// POST /api/timeclock/clock-in - Registrar entrada
router.post('/clock-in', protect, async (req, res) => {
  try {
    const employee = await findUserById(req.user.id);
    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Validar jornada configurada
    if (!employee.workSchedule) {
      logger.warn('Tentativa de bater ponto sem jornada configurada', { userId: req.user.id });
      return res.status(400).json({ error: 'Jornada de trabalho não configurada. Entre em contato com o administrador.' });
    }

    // Verificar se pelo menos um dia tem jornada configurada
    const hasAtLeastOneDay = Object.values(employee.workSchedule).some(day => 
      day !== null && day !== undefined && day.startTime && day.endTime
    );
    
    if (!hasAtLeastOneDay) {
      logger.warn('Tentativa de bater ponto com jornada vazia', { 
        userId: req.user.id,
        workSchedule: employee.workSchedule 
      });
      return res.status(400).json({ error: 'Jornada de trabalho não configurada. Entre em contato com o administrador.' });
    }

    const now = new Date();
    const today = formatDateString(now);

    // Verificar se já bateu entrada hoje
    const existingRecord = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId: req.user.id,
          date: today
        }
      }
    });

    if (existingRecord?.entryTime) {
      return res.status(400).json({ error: 'Entrada já registrada para hoje' });
    }

    // Verificar jornada do dia
    const schedule = getWorkScheduleForDay(employee, now);
    if (!schedule) {
      return res.status(400).json({ error: 'Não há jornada configurada para este dia da semana' });
    }

    // Criar ou atualizar registro
    const record = await getOrCreateTimeClockRecord(req.user.id, today);
    
    const updatedRecord = await prisma.timeClock.update({
      where: { id: record.id },
      data: {
        entryTime: now
      },
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

    // Log de auditoria
    const metadata = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_entry',
      entityType: 'timeclock',
      entityId: updatedRecord.id,
      userId: req.user.id,
      targetUserId: req.user.id,
      description: `Entrada registrada às ${now.toLocaleTimeString('pt-BR')}`,
      metadata: {
        date: today,
        entryTime: now.toISOString()
      },
      ...metadata
    });

    // Enviar email
    await sendTimeClockEmail(employee, updatedRecord, 'entry');

    logger.info('Entrada registrada', {
      userId: req.user.id,
      date: today,
      entryTime: now.toISOString()
    });

    res.json(updatedRecord);
  } catch (error) {
    logger.logError(error, { context: 'Registrar entrada de ponto' });
    res.status(500).json({ error: 'Erro ao registrar entrada' });
  }
});

// POST /api/timeclock/clock-out-lunch - Registrar saída para almoço
router.post('/clock-out-lunch', protect, async (req, res) => {
  try {
    const today = formatDateString(new Date());

    const record = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId: req.user.id,
          date: today
        }
      }
    });

    if (!record) {
      return res.status(400).json({ error: 'Registro de ponto não encontrado. Registre a entrada primeiro.' });
    }

    if (!record.entryTime) {
      return res.status(400).json({ error: 'Entrada não registrada. Registre a entrada primeiro.' });
    }

    if (record.lunchExitTime) {
      return res.status(400).json({ error: 'Saída para almoço já registrada' });
    }

    const now = new Date();

    const updatedRecord = await prisma.timeClock.update({
      where: { id: record.id },
      data: {
        lunchExitTime: now
      },
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

    const employee = await findUserById(req.user.id);

    // Log de auditoria
    const metadata = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_lunch_exit',
      entityType: 'timeclock',
      entityId: updatedRecord.id,
      userId: req.user.id,
      targetUserId: req.user.id,
      description: `Saída para almoço registrada às ${now.toLocaleTimeString('pt-BR')}`,
      metadata: {
        date: today,
        lunchExitTime: now.toISOString()
      },
      ...metadata
    });

    // Enviar email
    await sendTimeClockEmail(employee, updatedRecord, 'lunch_exit');

    logger.info('Saída para almoço registrada', {
      userId: req.user.id,
      date: today,
      lunchExitTime: now.toISOString()
    });

    res.json(updatedRecord);
  } catch (error) {
    logger.logError(error, { context: 'Registrar saída para almoço' });
    res.status(500).json({ error: 'Erro ao registrar saída para almoço' });
  }
});

// POST /api/timeclock/clock-in-lunch - Registrar volta do almoço
router.post('/clock-in-lunch', protect, async (req, res) => {
  try {
    const today = formatDateString(new Date());

    const record = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId: req.user.id,
          date: today
        }
      }
    });

    if (!record) {
      return res.status(400).json({ error: 'Registro de ponto não encontrado. Registre a entrada primeiro.' });
    }

    if (!record.lunchExitTime) {
      return res.status(400).json({ error: 'Saída para almoço não registrada. Registre a saída para almoço primeiro.' });
    }

    if (record.lunchReturnTime) {
      return res.status(400).json({ error: 'Volta do almoço já registrada' });
    }

    const now = new Date();

    const updatedRecord = await prisma.timeClock.update({
      where: { id: record.id },
      data: {
        lunchReturnTime: now
      },
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

    const employee = await findUserById(req.user.id);

    // Log de auditoria
    const metadata = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_lunch_return',
      entityType: 'timeclock',
      entityId: updatedRecord.id,
      userId: req.user.id,
      targetUserId: req.user.id,
      description: `Volta do almoço registrada às ${now.toLocaleTimeString('pt-BR')}`,
      metadata: {
        date: today,
        lunchReturnTime: now.toISOString()
      },
      ...metadata
    });

    // Enviar email
    await sendTimeClockEmail(employee, updatedRecord, 'lunch_return');

    logger.info('Volta do almoço registrada', {
      userId: req.user.id,
      date: today,
      lunchReturnTime: now.toISOString()
    });

    res.json(updatedRecord);
  } catch (error) {
    logger.logError(error, { context: 'Registrar volta do almoço' });
    res.status(500).json({ error: 'Erro ao registrar volta do almoço' });
  }
});

// POST /api/timeclock/clock-out - Registrar saída final
router.post('/clock-out', protect, async (req, res) => {
  try {
    const employee = await findUserById(req.user.id);
    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    const today = formatDateString(new Date());

    const record = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId: req.user.id,
          date: today
        }
      }
    });

    if (!record || !record.entryTime) {
      return res.status(400).json({ error: 'Entrada não registrada. Registre a entrada primeiro.' });
    }

    if (record.exitTime) {
      return res.status(400).json({ error: 'Saída já registrada para hoje' });
    }

    const now = new Date();
    const schedule = getWorkScheduleForDay(employee, now);

    // Calcular horas trabalhadas
    let totalWorkedHours = 0;
    if (record.entryTime) {
      totalWorkedHours = calculateWorkedHours(
        new Date(record.entryTime),
        now,
        employee.lunchBreakHours || 0
      );
    }

    // Calcular atraso
    let lateMinutes = 0;
    if (schedule && record.entryTime) {
      lateMinutes = calculateLateMinutes(
        new Date(record.entryTime),
        schedule.startTime,
        employee.lateTolerance || 10
      );
    }

    // Calcular horas extras
    let overtimeHours = 0;
    if (schedule) {
      overtimeHours = calculateOvertimeHours(now, schedule.endTime);
    }

    // Calcular horas esperadas do dia
    const scheduledHours = getScheduledHoursForDay(employee, now);

    // Calcular horas negativas (se saiu antes do horário esperado)
    let negativeHours = 0;
    if (schedule && scheduledHours > 0) {
      const expectedExit = new Date(record.entryTime);
      const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
      expectedExit.setHours(endHour, endMinute, 0, 0);
      
      if (now < expectedExit) {
        negativeHours = (expectedExit.getTime() - now.getTime()) / (1000 * 60 * 60);
      }
    }

    // Preparar dados de atualização
    const updateData = {
      exitTime: now,
      totalWorkedHours,
      scheduledHours,
      lateMinutes,
      overtimeHours: overtimeHours > 0 ? overtimeHours : null,
      negativeHours: negativeHours > 0 ? negativeHours : null
    };

    // Se houver horas extras, criar crédito no banco de horas
    if (overtimeHours > 0) {
      const hourBankCredit = await prisma.hourBankRecord.create({
        data: {
          employeeId: req.user.id,
          date: today,
          type: 'credit',
          hours: overtimeHours,
          reason: `Hora extra automática do ponto - ${today}`,
          createdBy: req.user.id,
          status: 'pending'
        }
      });

      updateData.hourBankCreditId = hourBankCredit.id;
    }

    // Se houver horas negativas e saldo positivo no banco de horas, criar débito
    if (negativeHours > 0) {
      const balance = await calculateHourBankBalance(req.user.id);
      
      if (balance > 0) {
        const debitHours = Math.min(negativeHours, balance);
        
        const hourBankDebit = await prisma.hourBankRecord.create({
          data: {
            employeeId: req.user.id,
            date: today,
            type: 'debit',
            hours: debitHours,
            reason: `Compensação automática de horas negativas - ${today}`,
            createdBy: req.user.id,
            status: 'pending'
          }
        });

        updateData.hourBankDebitId = hourBankDebit.id;
      }
    }

    const updatedRecord = await prisma.timeClock.update({
      where: { id: record.id },
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

    // Log de auditoria
    const metadata = getRequestMetadata(req);
    await logAudit({
      action: 'timeclock_exit',
      entityType: 'timeclock',
      entityId: updatedRecord.id,
      userId: req.user.id,
      targetUserId: req.user.id,
      description: `Saída registrada às ${now.toLocaleTimeString('pt-BR')}. Horas trabalhadas: ${totalWorkedHours.toFixed(2)}h${overtimeHours > 0 ? `, Horas extras: ${overtimeHours.toFixed(2)}h` : ''}${lateMinutes > 0 ? `, Atraso: ${lateMinutes}min` : ''}`,
      metadata: {
        date: today,
        exitTime: now.toISOString(),
        totalWorkedHours,
        overtimeHours,
        lateMinutes,
        negativeHours
      },
      ...metadata
    });

    // Enviar email
    await sendTimeClockEmail(employee, updatedRecord, 'exit');

    logger.info('Saída registrada', {
      userId: req.user.id,
      date: today,
      exitTime: now.toISOString(),
      totalWorkedHours,
      overtimeHours,
      lateMinutes
    });

    res.json(updatedRecord);
  } catch (error) {
    logger.logError(error, { context: 'Registrar saída de ponto' });
    res.status(500).json({ error: 'Erro ao registrar saída' });
  }
});

// GET /api/timeclock/today - Status do ponto de hoje
router.get('/today', protect, async (req, res) => {
  try {
    const today = formatDateString(new Date());

    const record = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId: req.user.id,
          date: today
        }
      },
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

    res.json(record || null);
  } catch (error) {
    logger.logError(error, { context: 'Buscar status do ponto de hoje' });
    res.status(500).json({ error: 'Erro ao buscar status do ponto' });
  }
});

// GET /api/timeclock/my-records - Listar próprios registros
router.get('/my-records', protect, async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      employeeId: req.user.id
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const [records, total] = await Promise.all([
      prisma.timeClock.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: {
          date: 'desc'
        },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }),
      prisma.timeClock.count({ where })
    ]);

    res.json({
      records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.logError(error, { context: 'Listar registros de ponto' });
    res.status(500).json({ error: 'Erro ao listar registros de ponto' });
  }
});

// GET /api/timeclock/records/:employeeId - Listar registros de funcionário (admin)
router.get('/records/:employeeId', protect, admin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      employeeId
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const [records, total] = await Promise.all([
      prisma.timeClock.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: {
          date: 'desc'
        },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }),
      prisma.timeClock.count({ where })
    ]);

    res.json({
      records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.logError(error, { context: 'Listar registros de ponto de funcionário' });
    res.status(500).json({ error: 'Erro ao listar registros de ponto' });
  }
});

export default router;

