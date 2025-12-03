import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger.js';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: function() {
      // Senha não é obrigatória para usuários autenticados externamente
      return !this.externalAuth;
    },
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'employee'],
    default: 'employee',
  },
  name: {
    type: String,
    required: true,
  },
  department: {
    type: String,
    required: true,
  },
  // Campos para autenticação externa
  externalId: {
    type: String,
    unique: true,
    sparse: true // Permite que seja nulo para usuários existentes
  },
  externalAuth: {
    type: Boolean,
    default: false
  },
  // Limite de horas extras individual (se não definido, usa o padrão da empresa)
  overtimeLimit: {
    type: Number,
    min: 0,
    default: null
  },
  // Exceções de limite para meses específicos
  overtimeExceptions: [
    {
      month: { type: Number, min: 1, max: 12, required: true },
      year: { type: Number, min: 2020, max: 2100, required: true },
      additionalHours: { type: Number, default: 0, required: true }
    }
  ]
}, {
  timestamps: true,
});

userSchema.pre('save', async function(next) {
  // Se for um usuário externo ou a senha não foi modificada, pula o hash
  if (this.externalAuth || !this.isModified('password')) return next();
  
  // Se a senha estiver vazia para um usuário externo, pula o hash
  if (this.externalAuth && !this.password) return next();
  
  try {
    logger.debug('Hashing password', { email: this.email });
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    logger.debug('Password hashed successfully', { email: this.email });
    next();
  } catch (error) {
    logger.logError(error, { context: 'Password hashing', email: this.email });
    next(error);
  }
});

userSchema.methods.matchPassword = async function(candidatePassword) {
  // Se for um usuário externo e não tiver senha, não permite login local
  if (this.externalAuth && !this.password) {
    logger.warn('External user without password tried local login', { email: this.email });
    return false;
  }
  
  try {
    logger.debug('Comparing password', { email: this.email });
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    logger.debug('Password comparison result', { email: this.email, match: isMatch });
    return isMatch;
  } catch (error) {
    logger.logError(error, { context: 'Password comparison', email: this.email });
    throw error;
  }
};

const User = mongoose.model('User', userSchema);

export default User;
