import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      // Horas extras
      'overtime_created',
      'overtime_approved',
      'overtime_rejected',
      'overtime_updated',
      // Banco de horas
      'hourbank_credit_created',
      'hourbank_debit_created',
      'hourbank_approved',
      'hourbank_rejected',
      // Funcionários
      'employee_created',
      'employee_deleted',
      'employee_role_changed',
      'employee_limit_changed',
      'employee_exception_added',
      'employee_exception_removed',
      // Configurações
      'settings_updated',
      'settings_logo_updated'
    ],
    index: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ['overtime', 'hourbank', 'employee', 'settings'],
    index: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // Usuário afetado pela ação (se aplicável)
    index: true
  },
  description: {
    type: String,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {} // Dados adicionais como valores antigos/novos
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Índices compostos para melhorar performance de consultas
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetUserId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 }); // Para ordenação por data

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;

