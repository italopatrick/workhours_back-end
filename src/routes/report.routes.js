import express from 'express';
import PDFDocument from 'pdfkit';
import { createObjectCsvWriter } from 'csv-writer';
import { protect } from '../middleware/auth.js';
import Overtime from '../models/Overtime.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Generate PDF report
router.get('/pdf', protect, async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { user: req.user._id };
    const overtime = await Overtime.find(query)
      .populate('user', 'name email')
      .sort({ date: -1 });

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=overtime-report.pdf');

    doc.pipe(res);
    doc.fontSize(20).text('Overtime Report', { align: 'center' });
    doc.moveDown();

    overtime.forEach((record) => {
      doc.fontSize(12).text(`Employee: ${record.user.name}`);
      doc.fontSize(10).text(`Date: ${new Date(record.date).toLocaleDateString()}`);
      doc.text(`Time: ${record.startTime} - ${record.endTime}`);
      doc.text(`Description: ${record.description}`);
      doc.text(`Status: ${record.status}`);
      doc.moveDown();
    });

    doc.end();
  } catch (error) {
    logger.logError(error, { context: 'Gerar relatório PDF', userId: req.user?._id });
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate CSV report
router.get('/csv', protect, async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { user: req.user._id };
    const overtime = await Overtime.find(query)
      .populate('user', 'name email')
      .sort({ date: -1 });

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
      employee: record.user.name,
      date: new Date(record.date).toLocaleDateString(),
      startTime: record.startTime,
      endTime: record.endTime,
      description: record.description,
      status: record.status,
    }));

    await csvWriter.writeRecords(records);
    res.download('overtime-report.csv');
  } catch (error) {
    logger.logError(error, { context: 'Gerar relatório CSV', userId: req.user?._id });
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
