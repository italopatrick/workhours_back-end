import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
  }
}, {
  timestamps: true,
});

userSchema.pre('save', async function(next) {
  // Se for um usuário externo ou a senha não foi modificada, pula o hash
  if (this.externalAuth || !this.isModified('password')) return next();
  
  // Se a senha estiver vazia para um usuário externo, pula o hash
  if (this.externalAuth && !this.password) return next();
  
  try {
    console.log('Hashing password for user:', this.email);
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    console.log('Password hashed successfully for user:', this.email);
    next();
  } catch (error) {
    console.error('Error hashing password:', error);
    next(error);
  }
});

userSchema.methods.matchPassword = async function(candidatePassword) {
  // Se for um usuário externo e não tiver senha, não permite login local
  if (this.externalAuth && !this.password) {
    console.log('External user without password tried local login:', this.email);
    return false;
  }
  
  try {
    console.log('Comparing password for user:', this.email);
    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    console.log('Password match result:', isMatch);
    return isMatch;
  } catch (error) {
    console.error('Error comparing password:', error);
    throw error;
  }
};

const User = mongoose.model('User', userSchema);

export default User;
