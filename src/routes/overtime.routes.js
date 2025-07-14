import express from 'express';
import mongoose from 'mongoose';
import { protect, admin } from '../middleware/auth.js';
import Overtime from '../models/Overtime.js';
import User from '../models/User.js';
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

// Get all overtime records (filtered by user for employees, all for admin)
router.get('/', protect, async (req, res) => {
  try {
    const { startDate, endDate, employeeId } = req.query;
    console.log('Buscando registros:', { startDate, endDate, employeeId });

    // Cria o filtro base
    let filter = {};

    // Adiciona filtro de data apenas se fornecido
    if (startDate && endDate) {
      filter.date = {
        $gte: startDate,
        $lte: endDate
      };
    }

    // Se for um funcionário, filtra apenas seus registros
    if (req.user.role === 'employee') {
      filter.employeeId = req.user.id;
    } else if (employeeId) { // Se for admin e um employeeId foi fornecido
      filter.employeeId = employeeId;
    }

    console.log('Filtro final:', filter);

    // Busca os registros
    const records = await Overtime.find(filter)
      .populate('employeeId', 'name')
      .sort({ date: -1 });

    console.log('Registros encontrados:', records.length);

    // Formata os registros para o frontend
    const formattedRecords = records.map(record => ({
      id: record._id,
      employeeId: record.employeeId ? record.employeeId._id : null,
      employeeName: record.employeeId ? record.employeeId.name : 'Funcionário não encontrado',
      date: record.date, // O campo já é uma string no formato YYYY-MM-DD
      startTime: record.startTime,
      endTime: record.endTime,
      hours: record.hours, // Usa o valor já calculado no banco
      reason: record.reason,
      status: record.status
    }));

    console.log('Registros formatados:', formattedRecords);
    res.json(formattedRecords);
  } catch (error) {
    console.error('Erro ao buscar registros:', error);
    res.status(500).json({ message: 'Erro ao buscar registros', error: error.message });
  }
});

// Get my overtime records
router.get('/my', protect, async (req, res) => {
  try {
    const overtime = await Overtime.find({ employeeId: req.user._id })
      .sort({ date: -1 });
    res.json(overtime);
  } catch (error) {
    console.error('Error getting my overtime records:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new overtime record
router.post('/', protect, async (req, res) => {
  try {
    console.log('Dados recebidos:', req.body);
    const { date, startTime, endTime, reason } = req.body;
    
    // Se for admin, usa o employeeId do body, senão usa o id do usuário logado
    const employeeId = req.user.role === 'admin' ? req.body.employeeId : req.user._id;

    // Busca o funcionário para pegar o nome e limite de horas extras
    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
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
    const filter = {
      employeeId,
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ['approved', 'pending'] }
    };
    
    const overtimeRecords = await Overtime.find(filter);
    const currentMonthHours = overtimeRecords.reduce((sum, record) => sum + record.hours, 0);
    
    // 4. Busca o limite padrão da empresa
    const CompanySettings = mongoose.model('CompanySettings');
    const settings = await CompanySettings.findOne();
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
    const overtime = await Overtime.create({
      employeeId,
      date,
      startTime,
      endTime,
      hours,
      reason,
      status: 'pending'
    });

    // Popula os dados do funcionário e formata a resposta
    const populatedOvertime = await overtime.populate('employeeId', 'name email');
    
    // Formata a resposta
    const formattedOvertime = {
      id: populatedOvertime._id,
      employeeId: populatedOvertime.employeeId ? populatedOvertime.employeeId._id : null,
      employeeName: populatedOvertime.employeeId ? populatedOvertime.employeeId.name : 'Funcionário não encontrado',
      date: populatedOvertime.date,
      startTime: populatedOvertime.startTime,
      endTime: populatedOvertime.endTime,
      hours: populatedOvertime.hours,
      reason: populatedOvertime.reason,
      status: populatedOvertime.status
    };

    console.log('Registro criado:', formattedOvertime);
    res.status(201).json(formattedOvertime);
  } catch (error) {
    console.error('Erro ao criar registro:', error);
    res.status(500).json({ message: 'Erro ao criar registro', error: error.message });
  }
});

// Update overtime status (admin only)
router.patch('/:id', protect, admin, async (req, res) => {
  try {
    const overtime = await Overtime.findById(req.params.id);
    if (!overtime) {
      return res.status(404).json({ message: 'Registro de hora extra não encontrado' });
    }

    // Atualiza apenas o status
    overtime.status = req.body.status;
    const updatedOvertime = await Overtime.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    ).populate('employeeId', 'name email');
    
    // Formata a resposta no mesmo formato que o GET
    const formattedOvertime = {
      id: updatedOvertime._id,
      employeeId: updatedOvertime.employeeId ? updatedOvertime.employeeId._id : null,
      employeeName: updatedOvertime.employeeId ? updatedOvertime.employeeId.name : 'Funcionário não encontrado',
      date: updatedOvertime.date,
      startTime: updatedOvertime.startTime,
      endTime: updatedOvertime.endTime,
      hours: calculateHours(updatedOvertime.startTime, updatedOvertime.endTime),
      reason: updatedOvertime.reason,
      status: updatedOvertime.status
    };

    res.json(formattedOvertime);
  } catch (error) {
    console.error('Error updating overtime status:', error);
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
    let filter = {
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ['approved', 'pending'] } // Considera horas aprovadas e pendentes
    };
    
    // Se for funcionário comum, filtra apenas seus próprios registros
    if (req.user.role === 'employee') {
      filter.employeeId = req.user._id;
    } else if (req.query.employeeId) { // Se for admin e especificou um funcionário
      filter.employeeId = req.query.employeeId;
    }
    
    // Busca os registros de horas extras
    const overtimeRecords = await Overtime.find(filter)
      .populate('employeeId', 'name overtimeLimit');
    
    // Se for funcionário comum ou admin que especificou um funcionário
    if (req.user.role === 'employee' || req.query.employeeId) {
      // Calcula o total de horas extras do mês
      const totalHours = overtimeRecords.reduce((sum, record) => sum + record.hours, 0);
      
      // Busca o funcionário para obter o limite de horas extras
      const employeeId = req.user.role === 'employee' ? req.user._id : req.query.employeeId;
      const employee = await User.findById(employeeId).select('overtimeLimit overtimeExceptions');
      
      // Busca o limite padrão da empresa
      const CompanySettings = mongoose.model('CompanySettings');
      const settings = await CompanySettings.findOne();
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
        const empId = record.employeeId?._id.toString();
        if (!empId) continue;
        
        if (!employeeHours[empId]) {
          employeeHours[empId] = {
            employeeId: empId,
            employeeName: record.employeeId?.name || 'Funcionário não encontrado',
            totalHours: 0,
            overtimeLimit: record.employeeId?.overtimeLimit || null
          };
        }
        
        employeeHours[empId].totalHours += record.hours;
      }
      
      // Converte para array
      const result = Object.values(employeeHours);
      
      // Busca o limite padrão da empresa
      const CompanySettings = mongoose.model('CompanySettings');
      const settings = await CompanySettings.findOne();
      const defaultLimit = settings?.defaultOvertimeLimit || 40;
      
      // Calcula a porcentagem do limite para cada funcionário
      for (const emp of result) {
        // Busca o funcionário para verificar exceções
        const employee = await User.findById(emp.employeeId).select('overtimeExceptions');
        
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
    console.error('Erro ao calcular horas extras do mês atual:', error);
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
    console.error('Erro ao enviar email:', error);
    res.status(500).json({ message: 'Erro ao enviar email' });
  }
});

export default router;
