import mongoose from 'mongoose';

const companySettingsSchema = new mongoose.Schema({
  name: {
    type: String,
    default: ''
  },
  logo: {
    data: Buffer,
    contentType: String
  },
  reportHeader: {
    type: String,
    default: ''
  },
  reportFooter: {
    type: String,
    default: ''
  },
  managerEmail: {
    type: String,
    validate: {
      validator: function(v) {
        // Se o campo estiver vazio, retorna true (válido)
        if (!v) return true;
        // Se tiver valor, valida o formato do email
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} não é um email válido!`
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // Limite padrão de horas extras por mês para todos os funcionários
  defaultOvertimeLimit: {
    type: Number,
    min: 0,
    default: 40 // 40 horas por padrão
  },
  // Limites do banco de horas
  defaultAccumulationLimit: {
    type: Number,
    min: 0,
    default: 0 // 0 = sem limite (desabilitado por padrão)
  },
  defaultUsageLimit: {
    type: Number,
    min: 0,
    default: 0 // 0 = sem limite (desabilitado por padrão)
  }
});

// Middleware para atualizar o updatedAt
companySettingsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const CompanySettings = mongoose.model('CompanySettings', companySettingsSchema);
