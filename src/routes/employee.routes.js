import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

// Get all employees (authenticated users)
router.get('/', protect, async (req, res) => {
  try {
    // Se for admin, retorna todos os funcionários
    // Se for funcionário normal, retorna apenas funcionários ativos (não admin)
    const query = req.user.role === 'admin' ? {} : { role: { $ne: 'admin' } };
    
    const employees = await User.find(query)
      .select('-password')
      .sort({ name: 1 });
      
    // Converte _id para id nos resultados
    const formattedEmployees = employees.map(emp => ({
      id: emp._id,
      name: emp.name,
      email: emp.email,
      department: emp.department,
      role: emp.role,
      overtimeLimit: emp.overtimeLimit,
      overtimeExceptions: emp.overtimeExceptions || []
    }));
      
    res.json(formattedEmployees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new employee (admin only)
router.post('/', protect, admin, async (req, res) => {
  try {
    const { name, email, password, department, role, overtimeLimit } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const user = await User.create({
      name,
      email,
      password,
      department,
      role: role || 'employee',
      overtimeLimit: overtimeLimit || null,
    });

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      overtimeLimit: user.overtimeLimit,
      overtimeExceptions: user.overtimeExceptions || []
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete employee (admin only)
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Não permite deletar o próprio usuário
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    // Deleta o usuário
    await user.deleteOne();
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Atualizar limite de horas extras de um funcionário (admin only)
router.patch('/:id/overtime-limit', protect, admin, async (req, res) => {
  try {
    const { overtimeLimit } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Atualiza o limite de horas extras
    user.overtimeLimit = overtimeLimit === null || overtimeLimit === undefined ? null : Number(overtimeLimit);
    await user.save();

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      overtimeLimit: user.overtimeLimit,
      overtimeExceptions: user.overtimeExceptions || []
    });
  } catch (error) {
    console.error('Erro ao atualizar limite de horas extras:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Adicionar exceção mensal de horas extras (admin only)
router.post('/:id/overtime-exception', protect, admin, async (req, res) => {
  try {
    const { month, year, additionalHours } = req.body;
    
    if (!month || !year || additionalHours === undefined) {
      return res.status(400).json({ message: 'Mês, ano e horas adicionais são obrigatórios' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Verifica se já existe uma exceção para este mês/ano
    const existingExceptionIndex = user.overtimeExceptions?.findIndex(
      e => e.month === Number(month) && e.year === Number(year)
    );

    if (existingExceptionIndex >= 0) {
      // Atualiza a exceção existente
      if (!user.overtimeExceptions) {
        user.overtimeExceptions = [];
      }
      user.overtimeExceptions[existingExceptionIndex].additionalHours = Number(additionalHours);
    } else {
      // Adiciona nova exceção
      if (!user.overtimeExceptions) {
        user.overtimeExceptions = [];
      }
      user.overtimeExceptions.push({
        month: Number(month),
        year: Number(year),
        additionalHours: Number(additionalHours)
      });
    }

    await user.save();

    res.json({
      id: user._id,
      name: user.name,
      overtimeLimit: user.overtimeLimit,
      overtimeExceptions: user.overtimeExceptions
    });
  } catch (error) {
    console.error('Erro ao adicionar exceção de horas extras:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Remover exceção mensal de horas extras (admin only)
router.delete('/:id/overtime-exception/:month/:year', protect, admin, async (req, res) => {
  try {
    const { id, month, year } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Funcionário não encontrado' });
    }

    // Remove a exceção para este mês/ano
    if (user.overtimeExceptions && user.overtimeExceptions.length > 0) {
      user.overtimeExceptions = user.overtimeExceptions.filter(
        e => !(e.month === Number(month) && e.year === Number(year))
      );
      await user.save();
    }

    res.json({
      id: user._id,
      name: user.name,
      overtimeLimit: user.overtimeLimit,
      overtimeExceptions: user.overtimeExceptions
    });
  } catch (error) {
    console.error('Erro ao remover exceção de horas extras:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

export default router;
