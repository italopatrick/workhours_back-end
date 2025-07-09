import express from 'express';
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

    // Busca o funcionário para pegar o nome
    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Calcula as horas corretamente
    const hours = calculateHours(startTime, endTime);

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
