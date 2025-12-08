import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { findUserById } from '../models/user.model.js';
import { getWorkScheduleByEmployee } from '../models/workSchedule.model.js';
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
  logger.info('getOrCreateTimeClockRecord - buscando registro existente', {
    employeeId,
    date
  });

  try {
    const existingRecord = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId,
          date
        }
      }
    });

    if (existingRecord) {
      logger.info('getOrCreateTimeClockRecord - registro existente encontrado', {
        recordId: existingRecord.id,
        employeeId,
        date
      });
      return existingRecord;
    }

    logger.info('getOrCreateTimeClockRecord - criando novo registro', {
      employeeId,
      date
    });

    const newRecord = await prisma.timeClock.create({
      data: {
        employeeId,
        date
      }
    });

    logger.info('getOrCreateTimeClockRecord - registro criado com sucesso', {
      recordId: newRecord.id,
      employeeId,
      date
    });

    return newRecord;
  } catch (error) {
    logger.logError(error, {
      context: 'getOrCreateTimeClockRecord - erro ao criar/buscar registro',
      employeeId,
      date
    });
    throw error;
  }
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
    logger.info('Tentativa de bater ponto - buscando funcionário', { 
      userId: req.user.id,
      userName: req.user.name 
    });

    const employee = await findUserById(req.user.id);
    if (!employee) {
      logger.error('Funcionário não encontrado ao tentar bater ponto', { userId: req.user.id });
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    // Buscar jornada da tabela normalizada
    const workSchedules = await getWorkScheduleByEmployee(employee.id, true); // activeOnly = true
    
    logger.info('Dados do funcionário buscado', {
      userId: employee.id,
      workSchedulesCount: workSchedules?.length || 0,
      hasWorkSchedules: !!(workSchedules && workSchedules.length > 0),
      lunchBreakHours: employee.lunchBreakHours,
      lateTolerance: employee.lateTolerance
    });

    // Validar jornada configurada
    if (!workSchedules || workSchedules.length === 0) {
      logger.warn('Tentativa de bater ponto sem jornada configurada', { 
        userId: req.user.id,
        employeeId: employee.id,
        workSchedulesCount: workSchedules?.length || 0
      });
      return res.status(400).json({ error: 'Jornada de trabalho não configurada. Entre em contato com o administrador.' });
    }

    const now = new Date();
    const today = formatDateString(now);

    logger.info('Preparando para criar/atualizar registro de ponto', {
      employeeId: req.user.id,
      date: today,
      currentDate: now.toISOString()
    });

    // Verificar se já bateu entrada hoje
    const existingRecord = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId: req.user.id,
          date: today
        }
      }
    });

    logger.info('Verificação de registro existente', {
      employeeId: req.user.id,
      date: today,
      exists: !!existingRecord,
      hasEntryTime: !!existingRecord?.entryTime
    });

    if (existingRecord?.entryTime) {
      logger.warn('Tentativa de registrar entrada duplicada', {
        employeeId: req.user.id,
        date: today,
        recordId: existingRecord.id
      });
      return res.status(400).json({ error: 'Entrada já registrada para hoje' });
    }

    // Verificar jornada do dia usando a nova estrutura
    const schedule = getWorkScheduleForDay(workSchedules, now);
    logger.info('Verificação de jornada do dia', {
      employeeId: req.user.id,
      date: today,
      dayOfWeek: now.getDay(),
      hasSchedule: !!schedule,
      schedule
    });

    if (!schedule) {
      logger.warn('Não há jornada configurada para este dia da semana', {
        employeeId: req.user.id,
        date: today,
        dayOfWeek: now.getDay(),
        availableDays: workSchedules.map(s => s.dayOfWeek)
      });
      return res.status(400).json({ error: 'Não há jornada configurada para este dia da semana' });
    }

    // Criar ou atualizar registro
    logger.info('Chamando getOrCreateTimeClockRecord', {
      employeeId: req.user.id,
      date: today
    });

    const record = await getOrCreateTimeClockRecord(req.user.id, today);
    
    logger.info('Registro obtido/criado, atualizando entrada', {
      recordId: record.id,
      employeeId: req.user.id,
      date: today
    });
    
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

    logger.info('Tentativa de registrar saída para almoço', {
      userId: req.user.id,
      date: today
    });

    const record = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId: req.user.id,
          date: today
        }
      }
    });

    logger.info('Registro de ponto encontrado', {
      userId: req.user.id,
      date: today,
      recordExists: !!record,
      hasEntryTime: !!record?.entryTime,
      hasLunchExitTime: !!record?.lunchExitTime,
      hasLunchReturnTime: !!record?.lunchReturnTime,
      record: record ? {
        id: record.id,
        entryTime: record.entryTime,
        lunchExitTime: record.lunchExitTime,
        lunchReturnTime: record.lunchReturnTime
      } : null
    });

    if (!record) {
      logger.warn('Registro de ponto não encontrado para saída de almoço', {
        userId: req.user.id,
        date: today
      });
      return res.status(400).json({ error: 'Registro de ponto não encontrado. Registre a entrada primeiro.' });
    }

    if (!record.entryTime) {
      logger.warn('Tentativa de registrar saída para almoço sem entrada', {
        userId: req.user.id,
        date: today,
        recordId: record.id
      });
      return res.status(400).json({ error: 'Entrada não registrada. Registre a entrada primeiro.' });
    }

    if (record.lunchExitTime) {
      logger.warn('Tentativa de registrar saída para almoço duplicada', {
        userId: req.user.id,
        date: today,
        recordId: record.id,
        existingLunchExitTime: record.lunchExitTime
      });
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

    // Buscar jornada da tabela normalizada
    const workSchedules = await getWorkScheduleByEmployee(employee.id, true); // activeOnly = true

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
    const schedule = getWorkScheduleForDay(workSchedules, now);

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
    const scheduledHours = getScheduledHoursForDay({ workSchedules, lunchBreakHours: employee.lunchBreakHours }, now);

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
    const now = new Date();
    const today = formatDateString(now);

    logger.info('Buscando registro de ponto de hoje', {
      userId: req.user.id,
      date: today,
      dateObj: now.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });

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

    logger.info('Registro de ponto de hoje encontrado', {
      userId: req.user.id,
      date: today,
      recordExists: !!record,
      record: record ? {
        id: record.id,
        date: record.date,
        entryTime: record.entryTime,
        lunchExitTime: record.lunchExitTime,
        lunchReturnTime: record.lunchReturnTime,
        exitTime: record.exitTime
      } : null
    });

    // Se não encontrou registro para hoje, verificar se há registro aberto recente
    if (!record) {
      const recentRecords = await prisma.timeClock.findMany({
        where: {
          employeeId: req.user.id
        },
        orderBy: {
          date: 'desc'
        },
        take: 5,
        select: {
          id: true,
          date: true,
          entryTime: true,
          exitTime: true,
          lunchExitTime: true,
          lunchReturnTime: true
        }
      });

      logger.info('Registros recentes do funcionário (para debug)', {
        userId: req.user.id,
        todayDate: today,
        recentRecords: recentRecords.map(r => ({
          date: r.date,
          entryTime: r.entryTime,
          exitTime: r.exitTime,
          hasOpenRecord: !!r.entryTime && !r.exitTime
        }))
      });

      // Verificar se há um registro aberto recente (sem saída final)
      // Isso pode acontecer se o registro foi criado ontem e não foi finalizado
      const openRecord = recentRecords.find(r => r.entryTime && !r.exitTime);
      
      if (openRecord && openRecord.date !== today) {
        logger.warn('Registro aberto encontrado de data diferente de hoje', {
          userId: req.user.id,
          todayDate: today,
          openRecordDate: openRecord.date,
          recordId: openRecord.id
        });
        
        // Retornar o registro aberto mesmo sendo de data diferente
        // O frontend pode lidar com isso mostrando uma mensagem apropriada
        const fullOpenRecord = await prisma.timeClock.findUnique({
          where: { id: openRecord.id },
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
        
        if (fullOpenRecord) {
          logger.info('Retornando registro aberto de data anterior', {
            userId: req.user.id,
            recordDate: fullOpenRecord.date,
            todayDate: today
          });
          return res.json(fullOpenRecord);
        }
      }
    }

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

