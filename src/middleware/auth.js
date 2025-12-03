import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../utils/logger.js';

export const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      logger.warn('Token não encontrado', { url: req.originalUrl || req.url });
      return res.status(401).json({ message: 'Token não encontrado' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        logger.warn('Usuário não encontrado', { userId: decoded.id });
        return res.status(401).json({ message: 'Usuário não encontrado' });
      }

      logger.debug('Usuário autenticado', { 
        userId: user._id, 
        userName: user.name,
        userRole: user.role 
      });
      req.user = user;
      next();
    } catch (jwtError) {
      logger.warn('Erro ao verificar token', {
        error: jwtError.message,
        errorName: jwtError.name,
        url: req.originalUrl || req.url
      });
      // Se for erro de assinatura inválida, sugere limpar o token
      if (jwtError.message === 'invalid signature') {
        return res.status(401).json({ 
          message: 'Token inválido. Faça logout e login novamente.',
          code: 'INVALID_TOKEN_SIGNATURE'
        });
      }
      return res.status(401).json({ 
        message: 'Token inválido ou expirado',
        code: jwtError.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
      });
    }
  } catch (error) {
    logger.logError(error, { context: 'Middleware de autenticação', url: req.originalUrl || req.url });
    res.status(500).json({ message: 'Erro interno do servidor' });
  }
};

export const admin = (req, res, next) => {
  if (!req.user) {
    logger.warn('Usuário não autenticado na verificação de admin', {
      url: req.originalUrl || req.url
    });
    return res.status(401).json({ message: 'Usuário não autenticado' });
  }

  if (req.user.role !== 'admin') {
    logger.warn('Acesso negado: usuário não é admin', {
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      url: req.originalUrl || req.url
    });
    return res.status(403).json({ message: 'Acesso negado: apenas administradores' });
  }

  logger.debug('Acesso de admin concedido', {
    userId: req.user._id,
    userName: req.user.name
  });
  next();
};
