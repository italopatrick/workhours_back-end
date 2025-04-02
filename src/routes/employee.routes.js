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
      role: emp.role
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
    const { name, email, password, department, role } = req.body;

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
    });

    res.status(201).json({
      id: user._id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
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

export default router;
