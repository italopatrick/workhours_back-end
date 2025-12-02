import mongoose from 'mongoose';

const hourBankRecordSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: String, // Formato: YYYY-MM-DD
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  hours: {
    type: Number,
    required: true,
    min: 0
  },
  reason: {
    type: String,
    required: true
  },
  overtimeRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Overtime',
    default: null // null se não for vinculado a hora extra
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Índices para melhorar performance de consultas
hourBankRecordSchema.index({ employeeId: 1, date: -1 });
hourBankRecordSchema.index({ employeeId: 1, status: 1 });
hourBankRecordSchema.index({ overtimeRecordId: 1 });

const HourBankRecord = mongoose.model('HourBankRecord', hourBankRecordSchema);

export default HourBankRecord;

