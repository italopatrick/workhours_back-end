import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Create first admin user
router.post('/setup', async (req, res) => {
  try {
    console.log('Setup request received:', req.body);
    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists) {
      return res.status(400).json({ message: 'Admin user already exists' });
    }

    const { name, email, password, department } = req.body;
    const user = await User.create({
      name,
      email,
      password,
      role: 'admin',
      department: department || 'Administração'  // Valor padrão se não for fornecido
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });

    console.log('Admin user created successfully');
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      },
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    console.log('Login request received:', req.body);
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ message: 'Email ou senha inválidos' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ message: 'Email ou senha inválidos' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });

    console.log('Login successful for user:', user.name);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Get current user
router.get('/me', protect, async (req, res) => {
  try {
    console.log('Get current user request from:', req.user.name);
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Change password
router.patch('/change-password', protect, async (req, res) => {
  try {
    console.log('Change password request body:', req.body);
    const { oldPassword, newPassword } = req.body;
    
    // Log the extracted values
    console.log('Old Password:', oldPassword);
    console.log('New Password:', newPassword);
    
    // Get user with password field explicitly included
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    console.log('User found:', { id: user._id, hasPassword: !!user.password });
    
    // Check if current password matches
    const isMatch = await user.matchPassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Senha atual incorreta' });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Erro ao alterar senha', error: error.message });
  }
});

export default router;
