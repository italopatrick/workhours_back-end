import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      console.log('Token não encontrado');
      return res.status(401).json({ message: 'Token não encontrado' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        console.log('Usuário não encontrado:', decoded.id);
        return res.status(401).json({ message: 'Usuário não encontrado' });
      }

      console.log('Usuário autenticado:', user.name);
      req.user = user;
      next();
    } catch (jwtError) {
      console.log('Erro ao verificar token:', jwtError.message);
      return res.status(401).json({ message: 'Token inválido' });
    }
  } catch (error) {
    console.error('Erro na autenticação:', error);
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
};

export const admin = (req, res, next) => {
  if (!req.user) {
    console.log('Usuário não autenticado na verificação de admin');
    return res.status(401).json({ message: 'Usuário não autenticado' });
  }

  if (req.user.role !== 'admin') {
    console.log('Usuário não é admin:', req.user.name);
    return res.status(403).json({ message: 'Acesso negado: apenas administradores' });
  }

  console.log('Acesso de admin concedido para:', req.user.name);
  next();
};
