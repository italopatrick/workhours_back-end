import express from 'express';
import PDFDocument from 'pdfkit';
import { createObjectCsvWriter } from 'csv-writer';
import { protect } from '../middleware/auth.js';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Generate PDF report
router.get('/pdf', protect, async (req, res) => {
  try {
    // Construir filtro baseado na role
    let prismaFilter = {};
    
    if (req.user.role === 'employee') {
      // Employee vê apenas próprios registros
      prismaFilter.employeeId = req.user.id;
    } else if (req.user.role === 'manager') {
      // Manager vê registros do departamento
      const departmentEmployees = await prisma.user.findMany({
        where: { department: req.user.department },
        select: { id: true }
      });
      const employeeIds = departmentEmployees.map(emp => emp.id);
      prismaFilter.employeeId = { in: employeeIds };
    }
    // Admin vê tudo (prismaFilter vazio)
    
    const overtime = await prisma.overtimeRecord.findMany({
      where: prismaFilter,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=overtime-report.pdf');

    doc.pipe(res);
    doc.fontSize(20).text('Overtime Report', { align: 'center' });
    doc.moveDown();

    overtime.forEach((record) => {
      doc.fontSize(12).text(`Employee: ${record.employee.name}`);
      doc.fontSize(10).text(`Date: ${new Date(record.date).toLocaleDateString()}`);
      doc.text(`Time: ${record.startTime} - ${record.endTime}`);
      doc.text(`Description: ${record.reason || 'N/A'}`);
      doc.text(`Status: ${record.status}`);
      doc.moveDown();
    });

    doc.end();
  } catch (error) {
    logger.logError(error, { context: 'Gerar relatório PDF', userId: req.user?.id });
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate CSV report
router.get('/csv', protect, async (req, res) => {
  try {
    // Construir filtro baseado na role
    let prismaFilter = {};
    
    if (req.user.role === 'employee') {
      // Employee vê apenas próprios registros
      prismaFilter.employeeId = req.user.id;
    } else if (req.user.role === 'manager') {
      // Manager vê registros do departamento
      const departmentEmployees = await prisma.user.findMany({
        where: { department: req.user.department },
        select: { id: true }
      });
      const employeeIds = departmentEmployees.map(emp => emp.id);
      prismaFilter.employeeId = { in: employeeIds };
    }
    // Admin vê tudo (prismaFilter vazio)
    
    const overtime = await prisma.overtimeRecord.findMany({
      where: prismaFilter,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    const csvWriter = createObjectCsvWriter({
      path: 'overtime-report.csv',
      header: [
        { id: 'employee', title: 'Employee' },
        { id: 'date', title: 'Date' },
        { id: 'startTime', title: 'Start Time' },
        { id: 'endTime', title: 'End Time' },
        { id: 'description', title: 'Description' },
        { id: 'status', title: 'Status' },
      ],
    });

    const records = overtime.map((record) => ({
      employee: record.employee.name,
      date: new Date(record.date).toLocaleDateString(),
      startTime: record.startTime,
      endTime: record.endTime,
      description: record.reason || 'N/A',
      status: record.status,
    }));

    await csvWriter.writeRecords(records);
    res.download('overtime-report.csv');
  } catch (error) {
    logger.logError(error, { context: 'Gerar relatório CSV', userId: req.user?.id });
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
