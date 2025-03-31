import mongoose from 'mongoose';

const overtimeSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  hours: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Middleware para validar o formato das horas
overtimeSchema.pre('save', function(next) {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  
  if (!timeRegex.test(this.startTime) || !timeRegex.test(this.endTime)) {
    next(new Error('Formato de hora inválido. Use HH:mm'));
    return;
  }

  next();
});

const Overtime = mongoose.model('Overtime', overtimeSchema);

export default Overtime;
