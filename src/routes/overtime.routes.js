import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { findUserById } from '../models/user.model.js';
import { getOrCreateSettings } from '../models/companySettings.model.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import { formatDateForDisplay } from '../utils/dateFormatter.js';
import logger from '../utils/logger.js';
import nodemailer from 'nodemailer';

const router = express.Router();

// Configuração do transporte de email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Função para calcular horas entre dois horários
const calculateHours = (startTime, endTime) => {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  let totalMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60; // Ajusta para casos que passam da meia-noite
  }
  
  return Number((totalMinutes / 60).toFixed(2)); // Retorna horas com 2 casas decimais
};

// Função para formatar horas para exibição
const formatHoursForDisplay = (hours) => {
  if (typeof hours !== 'number') {
    hours = Number(hours);
  }
  
  const hoursInt = Math.floor(hours);
  const minutes = Math.round((hours - hoursInt) * 60);
  
  return `${hoursInt}h${minutes > 0 ? minutes + 'min' : ''}`;
};

// Get all overtime records (filtered by user for employees, all for admin, department for manager)
router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate, employeeId, department } = req.query;
    logger.debug('Buscando registros de horas extras', { startDate, endDate, employeeId, department, userId: req.user?.id, userRole: req.user?.role });

    // Cria o filtro base
    let filter = {};

    // Cria o filtro Prisma
    const prismaFilter = {};

    // Adiciona filtro de data apenas se fornecido
    if (startDate && endDate) {
      prismaFilter.date = {
        gte: startDate,
        lte: endDate
      };
    }

    // Filtros baseados na role
    if (req.user.role === 'employee') {
      // Employee vê apenas próprios registros
      prismaFilter.employeeId = req.user.id;
    } else if (req.user.role === 'manager') {
      // Manager vê registros do departamento
      // Se forneceu employeeId, validar se pertence ao departamento
      if (employeeId) {
        const employee = await findUserById(employeeId);
        if (!employee) {
          return res.status(404).json({ message: 'Funcionário não encontrado' });
        }
        if (employee.department !== req.user.department) {
          return res.status(403).json({ 
            message: 'Acesso negado. Você só pode ver registros de funcionários do seu departamento.' 
          });
        }
        prismaFilter.employeeId = employeeId;
      } else {
        // Filtrar por departamento do manager
        // Buscar todos os funcionários do departamento
        const departmentEmployees = await prisma.user.findMany({
          where: { department: req.user.department },
          select: { id: true }
        });
        const employeeIds = departmentEmployees.map(emp => emp.id);
        prismaFilter.employeeId = { in: employeeIds };
      }
    } else if (req.user.role === 'admin') {
      // Admin pode ver tudo, mas pode filtrar por employeeId ou department
      if (employeeId) {
        prismaFilter.employeeId = employeeId;
      } else if (department) {
        // Filtrar por departamento
        const departmentEmployees = await prisma.user.findMany({
          where: { department },
          select: { id: true }
        });
        const employeeIds = departmentEmployees.map(emp => emp.id);
        prismaFilter.employeeId = { in: employeeIds };
      }
    }

    logger.debug('Filtro aplicado', { filter: prismaFilter, userId: req.user?.id });

    // Busca os registros
    const records = await prisma.overtime.findMany({
      where: prismaFilter,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            department: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    logger.debug('Registros encontrados', { count: records.length, userId: req.user?.id });

    // Formata os registros para o frontend
    const formattedRecords = records.map(record => ({
      id: record.id,
      employeeId: record.employee ? record.employee.id : null,
      employeeName: record.employee ? record.employee.name : 'Funcionário não encontrado',
      date: record.date, // O campo já é uma string no formato YYYY-MM-DD
      startTime: record.startTime,
      endTime: record.endTime,
      hours: record.hours, // Usa o valor já calculado no banco
      reason: record.reason,
      status: record.status
    }));

    logger.debug('Registros formatados para resposta', { count: formattedRecords.length });
    res.json(formattedRecords);
  } catch (error) {
    logger.logError(error, { context: 'Buscar registros de horas extras', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao buscar registros', error: error.message });
  }
});

// Get my overtime records
router.get('/my', protect, async (req, res) => {
  try {
    const overtime = await prisma.overtime.findMany({
      where: { employeeId: req.user.id },
      orderBy: { date: 'desc' }
    });
    res.json(overtime);
  } catch (error) {
    logger.logError(error, { context: 'Buscar minhas horas extras', userId: req.user?.id });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new overtime record
router.post('/', protect, async (req, res) => {
  try {
    const { date, startTime, endTime, reason } = req.body;
    
    // Se for admin ou manager, usa o employeeId do body, senão usa o id do usuário logado
    let employeeId;
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      employeeId = req.body.employeeId || req.user.id;
    } else {
      employeeId = req.user.id;
    }
    logger.debug('Dados de criação de hora extra recebidos', { employeeId, userId: req.user?.id });

    // Busca o funcionário para pegar o nome e limite de horas extras
    const employee = await findUserById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }
    
    // Se for manager, verificar se o funcionário pertence ao seu departamento
    if (req.user.role === 'manager' && employeeId !== req.user.id) {
      if (employee.department !== req.user.department) {
        return res.status(403).json({ 
          message: 'Você só pode criar horas extras para funcionários do seu departamento' 
        });
      }
    }

    // Calcula as horas corretamente
    const hours = calculateHours(startTime, endTime);
    
    // Verifica se o registro vai ultrapassar o limite de horas extras
    // 1. Obtém o mês e ano atual
    const overtimeDate = new Date(date);
    const currentYear = overtimeDate.getFullYear();
    const currentMonth = overtimeDate.getMonth() + 1; // getMonth() retorna 0-11
    
    // 2. Formata as datas de início e fim do mês
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    // 3. Busca os registros de horas extras do mês
    const prismaFilter = {
      employeeId,
      date: { gte: startDate, lte: endDate },
      status: { in: ['approved', 'pending'] }
    };
    
    const overtimeRecords = await prisma.overtime.findMany({
      where: prismaFilter
    });
    const currentMonthHours = overtimeRecords.reduce((sum, record) => sum + record.hours, 0);
    
    // 4. Busca o limite padrão da empresa
    const settings = await getOrCreateSettings();
    const defaultLimit = settings?.defaultOvertimeLimit || 40;
    
    // 5. Determina o limite aplicável (individual ou padrão)
    let overtimeLimit = employee.overtimeLimit || defaultLimit;
    
    // 6. Verifica se há exceções para o mês atual
    let additionalHours = 0;
    if (employee.overtimeExceptions && employee.overtimeExceptions.length > 0) {
      const exception = employee.overtimeExceptions.find(
        e => e.month === currentMonth && e.year === currentYear
      );
      if (exception) {
        additionalHours = exception.additionalHours;
      }
    }
    
    // 7. Calcula o limite efetivo
    const effectiveLimit = overtimeLimit + additionalHours;
    
    // 8. Verifica se o registro vai ultrapassar o limite
    const totalAfterRegistration = currentMonthHours + hours;
    if (totalAfterRegistration > effectiveLimit) {
      return res.status(400).json({ 
        message: `Este registro ultrapassará o limite de horas extras. Total após registro: ${formatHoursForDisplay(totalAfterRegistration)}, de ${formatHoursForDisplay(effectiveLimit)} permitidas.`,
        currentHours: currentMonthHours,
        newHours: hours,
        totalAfterRegistration,
        limit: effectiveLimit
      });
    }
    
    // Cria o registro de hora extra
    const overtime = await prisma.overtime.create({
      data: {
        employeeId,
        date,
        startTime,
        endTime,
        hours,
        reason,
        status: 'pending',
        createdBy: req.user.id
      }
    });

    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'overtime_created',
      entityType: 'overtime',
      entityId: overtime.id,
      userId: req.user.id,
      targetUserId: employeeId,
      description: `Hora extra criada: ${hours}h em ${formatDateForDisplay(date)} - ${reason}`,
      metadata: {
        hours,
        date,
        startTime,
        endTime
      },
      ...requestMeta
    });

    // Busca os dados do funcionário e formata a resposta
    const overtimeWithEmployee = await prisma.overtime.findUnique({
      where: { id: overtime.id },
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
    
    // Formata a resposta
    const formattedOvertime = {
      id: overtimeWithEmployee.id,
      employeeId: overtimeWithEmployee.employee ? overtimeWithEmployee.employee.id : null,
      employeeName: overtimeWithEmployee.employee ? overtimeWithEmployee.employee.name : 'Funcionário não encontrado',
      date: overtimeWithEmployee.date,
      startTime: overtimeWithEmployee.startTime,
      endTime: overtimeWithEmployee.endTime,
      hours: overtimeWithEmployee.hours,
      reason: overtimeWithEmployee.reason,
      status: overtimeWithEmployee.status
    };

    logger.info('Registro de hora extra criado', { overtimeId: formattedOvertime.id, employeeId, hours, userId: req.user?.id });

    // Se a hora extra foi criada como aprovada, cria crédito automaticamente
    if (overtime.status === 'approved') {
      try {
        // Verificar limites
        const settings = await getOrCreateSettings();
        const accumulationLimit = settings?.defaultAccumulationLimit || 0;

        // Calcular saldo atual
        const approvedRecords = await prisma.hourBankRecord.findMany({
          where: {
            employeeId: overtime.employeeId,
            status: 'approved'
          }
        });

        let currentBalance = 0;
        approvedRecords.forEach(record => {
          if (record.type === 'credit') {
            currentBalance += record.hours;
          } else {
            currentBalance -= record.hours;
          }
        });

        // Verificar limite de acúmulo (se configurado)
        const totalAfterCredit = currentBalance + overtime.hours;
        if (accumulationLimit > 0 && totalAfterCredit > accumulationLimit) {
          logger.warn('Limite de acúmulo excedido', { employeeId: overtime.employeeId, currentBalance, accumulationLimit });
        } else {
          // Criar crédito no banco de horas automaticamente
          await prisma.hourBankRecord.create({
            data: {
              employeeId: overtime.employeeId,
              date: overtime.date,
              type: 'credit',
              hours: overtime.hours,
              reason: `${overtime.reason} (via hora extra)`,
              overtimeRecordId: overtime.id,
              status: 'approved',
              createdBy: req.user.id
            }
          });
          logger.info('Crédito no banco de horas criado automaticamente', { overtimeId: overtime._id, employeeId: overtime.employeeId });
        }
      } catch (error) {
        logger.logError(error, { context: 'Criar crédito no banco de horas automaticamente', overtimeId: overtime._id });
      }
    }

    res.status(201).json(formattedOvertime);
  } catch (error) {
    logger.logError(error, { context: 'Criar registro de hora extra', employeeId, userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao criar registro', error: error.message });
  }
});

// Update overtime status (admin or manager)
router.patch('/:id', protect, async (req, res) => {
  try {
    // Verificar se é admin ou manager
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Acesso negado: apenas administradores e gestores' });
    }

    const overtime = await prisma.overtime.findUnique({
      where: { id: req.params.id },
      include: {
        employee: {
          select: {
            id: true,
            department: true
          }
        }
      }
    });
    if (!overtime) {
      return res.status(404).json({ message: 'Registro de hora extra não encontrado' });
    }

    // Se for manager, verificar se o funcionário pertence ao seu departamento
    if (req.user.role === 'manager') {
      if (!overtime.employee || overtime.employee.department !== req.user.department) {
        return res.status(403).json({ 
          message: 'Acesso negado. Você só pode aprovar horas extras de funcionários do seu departamento.' 
        });
      }
    }

    const oldStatus = overtime.status;
    const newStatus = req.body.status;

    // Preparar campos de atualização
    const updateData = { status: newStatus };
    
    if (newStatus === 'approved' && oldStatus !== 'approved') {
      updateData.approvedBy = req.user.id;
      updateData.approvedAt = new Date();
      updateData.rejectedBy = null;
      updateData.rejectedAt = null;
    } else if (newStatus === 'rejected' && oldStatus !== 'rejected') {
      updateData.rejectedBy = req.user.id;
      updateData.rejectedAt = new Date();
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    }

    // Atualiza o status e campos de auditoria
    const updatedOvertime = await prisma.overtime.update({
      where: { id: req.params.id },
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

    // Registrar log de auditoria para aprovação/rejeição
    if ((newStatus === 'approved' && oldStatus !== 'approved') || (newStatus === 'rejected' && oldStatus !== 'rejected')) {
      const requestMeta = getRequestMetadata(req);
      const actionName = newStatus === 'approved' ? 'overtime_approved' : 'overtime_rejected';
      await logAudit({
        action: actionName,
        entityType: 'overtime',
        entityId: overtime.id,
        userId: req.user.id,
        targetUserId: overtime.employeeId,
        description: `Hora extra ${newStatus === 'approved' ? 'aprovada' : 'rejeitada'}: ${overtime.hours}h em ${formatDateForDisplay(overtime.date)}`,
        metadata: {
          hours: overtime.hours,
          date: overtime.date,
          previousStatus: oldStatus,
          newStatus: newStatus
        },
        ...requestMeta
      });
    }
    
    // Se a hora extra foi aprovada e não havia crédito no banco de horas, cria automaticamente
    if (newStatus === 'approved' && oldStatus !== 'approved') {
      try {
        // Verificar se já existe crédito vinculado a esta hora extra
        const existingCredit = await prisma.hourBankRecord.findFirst({
          where: {
            overtimeRecordId: overtime.id
          }
        });

        if (!existingCredit) {
          // Buscar limites para validação
          const settings = await getOrCreateSettings();
          const accumulationLimit = settings?.defaultAccumulationLimit || 0;

          // Calcular saldo atual
          const approvedRecords = await prisma.hourBankRecord.findMany({
            where: {
              employeeId: overtime.employeeId,
              status: 'approved'
            }
          });

          let currentBalance = 0;
          approvedRecords.forEach(record => {
            if (record.type === 'credit') {
              currentBalance += record.hours;
            } else {
              currentBalance -= record.hours;
            }
          });

          // Verificar limite de acúmulo (se configurado)
          const totalAfterCredit = currentBalance + overtime.hours;
          if (accumulationLimit > 0 && totalAfterCredit > accumulationLimit) {
            logger.warn('Limite de acúmulo excedido', { employeeId: overtime.employeeId, currentBalance, accumulationLimit });
            // Não cria o crédito se exceder o limite, mas continua a aprovação da hora extra
          } else {
            // Criar crédito no banco de horas automaticamente
            const hourBankCredit = await prisma.hourBankRecord.create({
              data: {
                employeeId: overtime.employeeId,
                date: overtime.date,
                type: 'credit',
                hours: overtime.hours,
                reason: `${overtime.reason} (via hora extra aprovada)`,
                overtimeRecordId: overtime.id,
                status: 'approved', // Aprovado automaticamente quando a hora extra é aprovada
                createdBy: req.user.id,
                approvedBy: req.user.id, // Admin que aprovou a hora extra também aprova o crédito
                approvedAt: new Date()
              }
            });
            
            // Registrar log de auditoria para o crédito criado automaticamente
            const requestMeta = getRequestMetadata(req);
            await logAudit({
              action: 'hourbank_credit_created',
              entityType: 'hourbank',
              entityId: hourBankCredit.id,
              userId: req.user.id,
              targetUserId: overtime.employeeId,
              description: `Crédito no banco de horas criado automaticamente via hora extra aprovada: ${overtime.hours}h em ${formatDateForDisplay(overtime.date)}`,
              metadata: {
                hours: overtime.hours,
                date: overtime.date,
                type: 'credit',
                overtimeRecordId: overtime.id,
                autoCreated: true
              },
              ...requestMeta
            });
            
            logger.info('Crédito no banco de horas criado automaticamente', { overtimeId: overtime.id, employeeId: overtime.employeeId });
          }
        }
      } catch (error) {
        // Log do erro mas não impede a aprovação da hora extra
        logger.logError(error, { context: 'Criar crédito no banco de horas automaticamente', overtimeId: overtime._id });
      }
    }
    
    // Formata a resposta no mesmo formato que o GET
    const formattedOvertime = {
      id: updatedOvertime.id,
      employeeId: updatedOvertime.employee ? updatedOvertime.employee.id : null,
      employeeName: updatedOvertime.employee ? updatedOvertime.employee.name : 'Funcionário não encontrado',
      date: updatedOvertime.date,
      startTime: updatedOvertime.startTime,
      endTime: updatedOvertime.endTime,
      hours: calculateHours(updatedOvertime.startTime, updatedOvertime.endTime),
      reason: updatedOvertime.reason,
      status: updatedOvertime.status
    };

    res.json(formattedOvertime);
  } catch (error) {
    logger.logError(error, { context: 'Atualizar status de hora extra', overtimeId: req.params.id, userId: req.user?.id });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current month overtime hours for employee
router.get('/current-month', protect, async (req, res) => {
  try {
    // Obtém o mês e ano atual
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // getMonth() retorna 0-11
    
    // Formata as datas de início e fim do mês atual
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(currentYear, currentMonth, 0).getDate(); // Último dia do mês atual
    const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    // Define o filtro base para o mês atual
    const prismaFilter = {
      date: { gte: startDate, lte: endDate },
      status: { in: ['approved', 'pending'] } // Considera horas aprovadas e pendentes
    };
    
    // Se for funcionário comum, filtra apenas seus próprios registros
    if (req.user.role === 'employee') {
      prismaFilter.employeeId = req.user.id;
    } else if (req.query.employeeId) { // Se for admin e especificou um funcionário
      prismaFilter.employeeId = req.query.employeeId;
    }
    
    // Busca os registros de horas extras
    const overtimeRecords = await prisma.overtime.findMany({
      where: prismaFilter,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            overtimeLimit: true
          }
        }
      }
    });
    
    // Se for funcionário comum ou admin que especificou um funcionário
    if (req.user.role === 'employee' || req.query.employeeId) {
      // Calcula o total de horas extras do mês
      const totalHours = overtimeRecords.reduce((sum, record) => sum + record.hours, 0);
      
      // Busca o funcionário para obter o limite de horas extras
      const employeeId = req.user.role === 'employee' ? req.user.id : req.query.employeeId;
      const employee = await findUserById(employeeId);
      
      // Busca o limite padrão da empresa
      const settings = await getOrCreateSettings();
      const defaultLimit = settings?.defaultOvertimeLimit || 40;
      
      // Determina o limite aplicável (individual ou padrão)
      const overtimeLimit = employee?.overtimeLimit || defaultLimit;
      
      // Verifica se há exceções para o mês atual
      let additionalHours = 0;
      if (employee?.overtimeExceptions && employee.overtimeExceptions.length > 0) {
        const exception = employee.overtimeExceptions.find(
          e => e.month === currentMonth && e.year === currentYear
        );
        if (exception) {
          additionalHours = exception.additionalHours;
        }
      }
      
      // Calcula a porcentagem do limite utilizado
      const effectiveLimit = overtimeLimit + additionalHours;
      const limitPercentage = effectiveLimit > 0 ? 
        (totalHours / effectiveLimit) * 100 : 0;
      
      return res.json({
        totalHours,
        overtimeLimit,
        additionalHours,
        effectiveLimit,
        limitPercentage,
        showWarning: limitPercentage >= 80 && limitPercentage < 100,
        showAlert: limitPercentage >= 100
      });
    } 
    // Se for admin e não especificou um funcionário, retorna dados de todos os funcionários
    else {
      // Agrupa os registros por funcionário
      const employeeHours = {};
      
      for (const record of overtimeRecords) {
        const empId = record.employee?.id;
        if (!empId) continue;
        
        if (!employeeHours[empId]) {
          employeeHours[empId] = {
            employeeId: empId,
            employeeName: record.employee?.name || 'Funcionário não encontrado',
            totalHours: 0,
            overtimeLimit: record.employee?.overtimeLimit || null
          };
        }
        
        employeeHours[empId].totalHours += record.hours;
      }
      
      // Converte para array
      const result = Object.values(employeeHours);
      
      // Busca o limite padrão da empresa
      const settings = await getOrCreateSettings();
      const defaultLimit = settings?.defaultOvertimeLimit || 40;
      
      // Calcula a porcentagem do limite para cada funcionário
      for (const emp of result) {
        // Busca o funcionário para verificar exceções
        const employee = await findUserById(emp.employeeId);
        
        // Verifica se há exceções para o mês atual
        let additionalHours = 0;
        if (employee?.overtimeExceptions && employee.overtimeExceptions.length > 0) {
          const exception = employee.overtimeExceptions.find(
            e => e.month === currentMonth && e.year === currentYear
          );
          if (exception) {
            additionalHours = exception.additionalHours;
          }
        }
        
        // Determina o limite aplicável (individual ou padrão)
        const overtimeLimit = emp.overtimeLimit || defaultLimit;
        
        // Atualiza os dados do funcionário
        emp.overtimeLimit = overtimeLimit;
        emp.additionalHours = additionalHours;
        emp.effectiveLimit = overtimeLimit + additionalHours;
        emp.limitPercentage = overtimeLimit > 0 ? 
          (emp.totalHours / emp.effectiveLimit) * 100 : 0;
        emp.showWarning = emp.limitPercentage >= 80 && emp.limitPercentage < 100;
        emp.showAlert = emp.limitPercentage >= 100;
      }
      
      return res.json(result);
    }
  } catch (error) {
    logger.logError(error, { context: 'Calcular horas extras do mês atual', employeeId, month: currentMonth, year: currentYear });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Rota para enviar relatório por email
router.post('/send-report', protect, async (req, res) => {
  try {
    const { pdfBase64, managerEmail, employeeName, startDate, endDate } = req.body;

    // Converte o base64 em buffer
    const pdfBuffer = Buffer.from(pdfBase64.split(',')[1], 'base64');

    // Envia o email
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: managerEmail,
      subject: `Relatório de Horas Extras - ${employeeName}`,
      text: `Segue em anexo o relatório de horas extras do funcionário ${employeeName} referente ao período de ${new Date(startDate).toLocaleDateString()} a ${new Date(endDate).toLocaleDateString()}.`,
      attachments: [
        {
          filename: 'relatorio-horas-extras.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    res.json({ message: 'Email enviado com sucesso' });
  } catch (error) {
    logger.logError(error, { context: 'Enviar email de relatório', employeeName, managerEmail, startDate, endDate, userId: req.user?._id });
    res.status(500).json({ message: 'Erro ao enviar email' });
  }
});

export default router;
