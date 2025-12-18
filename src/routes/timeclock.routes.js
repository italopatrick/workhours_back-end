import express from 'express';
import { protect, adminOrManager } from '../middleware/auth.js';
import { checkEmployeeDepartment } from '../middleware/departmentAccess.js';
import prisma from '../config/database.js';
import { findUserById } from '../models/user.model.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import logger from '../utils/logger.js';

const router = express.Router();

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

// Helper: Calcular horas agendadas
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

// POST /timeclock/clock-in - Registrar entrada
router.post('/clock-in', protect, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    
    // Verificar se já existe registro para hoje
    let record = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId,
          date: today
        }
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
    if (employee && employee.workSchedule) {
      const lateMinutes = calculateLateMinutes(
        record.entryTime,
        employee.workSchedule,
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
    
    const record = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId,
          date: today
        }
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
    
    const record = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId,
          date: today
        }
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
    
    const updatedRecord = await prisma.timeClock.update({
      where: { id: record.id },
      data: {
        lunchReturnTime: new Date()
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
    
    const record = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId,
          date: today
        }
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
    
    // Calcular horas agendadas
    const scheduledHours = employee?.workSchedule 
      ? calculateScheduledHours(employee.workSchedule, today, lunchBreakHours)
      : 0;
    
    // Calcular horas negativas
    const negativeHours = scheduledHours > 0 ? Math.max(0, scheduledHours - totalWorkedHours) : 0;
    
    // Calcular horas extras
    const overtimeHours = totalWorkedHours > scheduledHours ? totalWorkedHours - scheduledHours : 0;
    
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
      } catch (error) {
        logger.warn('Erro ao buscar justificativas', { error: error.message });
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
    
    const record = await prisma.timeClock.findUnique({
      where: {
        employeeId_date: {
          employeeId,
          date: today
        }
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
    const { entryTime, lunchExitTime, lunchReturnTime, exitTime, justification } = req.body;
    
    // Buscar o registro
    const record = await prisma.timeClock.findUnique({
      where: { id: recordId },
      include: {
        employee: {
          select: {
            id: true,
            department: true,
            workSchedule: true,
            lunchBreakHours: true
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
    if (justification !== undefined) updateData.justification = justification;
    
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
        
        // Calcular horas agendadas
        const scheduledHours = record.employee.workSchedule 
          ? calculateScheduledHours(record.employee.workSchedule, record.date, lunchBreakHours)
          : 0;
        
        // Calcular horas negativas
        const negativeHours = scheduledHours > 0 ? Math.max(0, scheduledHours - totalWorkedHours) : 0;
        
        // Calcular horas extras
        const overtimeHours = totalWorkedHours > scheduledHours ? totalWorkedHours - scheduledHours : 0;
        
        // Calcular atraso
        const lateMinutes = finalEntryTime && record.employee.workSchedule
          ? calculateLateMinutes(
              finalEntryTime,
              record.employee.workSchedule,
              record.date,
              record.employee.lateTolerance || 0
            )
          : null;
        
        updateData.totalWorkedHours = totalWorkedHours;
        updateData.scheduledHours = scheduledHours;
        updateData.negativeHours = negativeHours > 0 ? negativeHours : null;
        updateData.overtimeHours = overtimeHours > 0 ? overtimeHours : null;
        updateData.lateMinutes = lateMinutes > 0 ? Math.round(lateMinutes) : null;
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

export default router;

