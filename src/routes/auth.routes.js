import express from 'express';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { getDepartmentName } from '../config/departments.js';
import { getUserRole } from '../config/userRoles.js';
import logger from '../utils/logger.js';

// URL da API externa do controle interno
const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'https://hall-api.azurewebsites.net/api';

const router = express.Router();

// Create first admin user
router.post('/setup', async (req, res) => {
  try {
    logger.info('Setup request received', { email: req.body?.email });
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

    logger.info('Admin user created successfully', { userId: user._id, email: user.email });
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
    logger.logError(error, { context: 'Setup - Criar admin' });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login via API externa do controle interno
router.post('/external-login', async (req, res) => {
  try {
    const { login, password } = req.body;
    logger.info('External login request received', { login: login || 'not provided' });
    
    if (!login || !password) {
      return res.status(400).json({ message: 'Login e senha são obrigatórios' });
    }
    
    // Autenticar com a API externa
    try {
      logger.debug('Tentando autenticar com a API externa', { apiUrl: EXTERNAL_API_URL, login });
      
      // Fazer uma requisição para a API externa para obter o token
      const loginResponse = await fetch(`${EXTERNAL_API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          login,
          password
        })
      });
      
      logger.debug('Status da resposta da API externa', { status: loginResponse.status, login });
      
      // Obter o texto da resposta primeiro
      const responseText = await loginResponse.text();
      
      // Verificar se a resposta contém mensagem de erro, mesmo com status 2xx
      if (!loginResponse.ok || responseText.includes('failed') || responseText.includes('error') || responseText.includes('403')) {
        logger.warn('Falha na autenticação com a API externa', { login, status: loginResponse.status });
        
        // Verificar se é um erro de permissão (403)
        if (responseText.includes('403')) {
          return res.status(403).json({ 
            message: 'Acesso negado pela API externa. O usuário não tem permissão para acessar o sistema.', 
            details: responseText 
          });
        }
        
        return res.status(401).json({ 
          message: 'Credenciais inválidas para o sistema externo', 
          details: responseText 
        });
      }
      
      // Tentar fazer parse do JSON
      let externalData;
      try {
        // Verificar se a resposta está vazia
        if (!responseText || responseText.trim() === '') {
          logger.warn('Resposta da API externa está vazia', { login, status: loginResponse.status });
          return res.status(500).json({ message: 'A API externa retornou uma resposta vazia' });
        } else {
          // Tentar fazer parse do JSON
          try {
            externalData = JSON.parse(responseText);
          } catch (parseError) {
            logger.logError(parseError, { context: 'Parse resposta JSON da API externa', login, responseLength: responseText?.length });
            return res.status(500).json({ 
              message: 'Erro ao processar resposta da API externa', 
              details: responseText.substring(0, 200) // Limita o tamanho da resposta para evitar dados muito grandes
            });
          }
        }
        
        logger.debug('Resposta da API externa recebida', { login, hasToken: !!externalData?.token, hasUser: !!externalData?.user });
      } catch (error) {
        logger.logError(error, { context: 'Processar resposta da API externa', login });
        return res.status(500).json({ message: 'Erro ao processar resposta da API externa', error: error.message });
      }
      
      if (!externalData || !externalData.token) {
        return res.status(401).json({ message: 'Resposta inválida da API externa' });
      }
      
      const externalToken = externalData.token;
      logger.debug('Token externo obtido com sucesso', { login });
      
      // Tentar obter dados do usuário diretamente da resposta de login
      let externalUserData;
      let externalId;
      
      if (externalData.user) {
        // Se a resposta de login já incluir dados do usuário
        logger.debug('Dados do usuário obtidos da resposta de login', { login, hasUserData: !!externalData.user });
        externalUserData = externalData.user;
        externalId = externalUserData.id || externalUserData.userId;
      } else {
        // Se precisarmos fazer uma chamada separada para obter dados do usuário
        logger.debug('Tentando obter dados do usuário da API externa', { login });
        try {
          const userResponse = await fetch(`${EXTERNAL_API_URL}/user`, {
            headers: {
              'Authorization': `Bearer ${externalToken}`
            }
          });
          
          logger.debug('Status da resposta de dados do usuário', { status: userResponse.status, login });
          
          if (!userResponse.ok) {
            const errorText = await userResponse.text();
            logger.warn('Falha ao obter dados do usuário via /user', { login, status: userResponse.status });
            
            // Tentar com /me em vez de /user
            logger.debug('Tentando obter dados do usuário via /me', { login });
            const meResponse = await fetch(`${EXTERNAL_API_URL}/me`, {
              headers: {
                'Authorization': `Bearer ${externalToken}`
              }
            });
            
            if (!meResponse.ok) {
              logger.warn('Falha ao obter dados do usuário via /me', { login, status: meResponse.status });
              return res.status(401).json({ message: 'Não foi possível obter dados do usuário externo' });
            }
            
            externalUserData = await meResponse.json();
            logger.debug('Dados do usuário obtidos via /me', { login, hasData: !!externalUserData });
          } else {
            externalUserData = await userResponse.json();
            logger.debug('Dados do usuário obtidos via /user', { login, hasData: !!externalUserData });
          }
          
          // Extrair o ID do usuário externo
          externalId = externalUserData.id || externalUserData.userId;
        } catch (error) {
          logger.logError(error, { context: 'Obter dados do usuário da API externa', login });
          return res.status(500).json({ message: 'Erro ao obter dados do usuário externo', error: error.message });
        }
      }
      
      if (!externalId) {
        return res.status(400).json({ message: 'ID do usuário externo não encontrado' });
      }
      
      // Procurar ou criar usuário local com base no ID externo
      let user = await User.findOne({ externalId });
      
      // Extrair informações do usuário externo
      const userName = externalUserData.name || externalUserData.displayName || externalUserData.userName || 'Usuário Externo';
      
      // Extrair o primeiro nome para usar no email padrão
      let firstName = '';
      if (userName && userName !== 'Usuário Externo') {
        // Pega o primeiro nome (antes do primeiro espaço)
        firstName = userName.split(' ')[0].toLowerCase();
        // Remove acentos e caracteres especiais para uso em email
        firstName = firstName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }
      
      // Usar o primeiro nome no email se disponível, caso contrário usar o ID externo
      const userEmail = externalUserData.email || 
        (firstName ? `${firstName}@primesoftware.com.br` : `${externalId}@primesoftware.com.br`);
      
      // Obter o nome do departamento a partir do ID do departamento
      let userDepartment = 'Externo';
      
      if (externalUserData.departmentId) {
        // Usar o mapeamento para obter o nome do departamento
        userDepartment = getDepartmentName(externalUserData.departmentId);
        logger.debug('Departamento mapeado', { departmentId: externalUserData.departmentId, departmentName: userDepartment, login });
      } else if (externalUserData.department) {
        // Usar o departamento diretamente se disponível
        userDepartment = externalUserData.department;
      }
      
      // Determinar o papel (role) do usuário com base no ID externo
      const userRole = getUserRole(externalId);
      logger.info('Dados extraídos do usuário externo', { externalId, userName, userEmail, userDepartment, userRole, login });
      
      if (!user) {
        // Criar novo usuário se não existir
        user = new User({
          name: userName,
          email: userEmail,
          department: userDepartment,
          externalId,
          externalAuth: true,
          role: userRole // Definir papel com base no ID externo
        });
        
        await user.save();
        logger.info('Novo usuário criado com ID externo', { externalId, userRole, userId: user._id, login });
      } else {
        // Atualizar dados do usuário existente
        user.name = userName;
        user.email = userEmail;
        user.department = userDepartment;
        user.externalAuth = true;
        user.role = userRole; // Atualizar papel com base no ID externo
        
        await user.save();
        logger.info('Usuário existente atualizado com ID externo', { externalId, userRole, userId: user._id, login });
      }
      
      // Gerar token JWT para o usuário
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
      });
      
      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          externalAuth: user.externalAuth
        },
      });
    } catch (error) {
      logger.logError(error, { context: 'Validar token externo', login: login || 'unknown' });
      return res.status(401).json({ message: 'Erro ao validar token externo' });
    }
  } catch (error) {
    const loginValue = req.body?.login || 'unknown';
    logger.logError(error, { context: 'External login', login: loginValue });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Rota para vincular conta externa com email
router.post('/link-external-account', async (req, res) => {
  try {
    logger.info('Link external account request received', { email: req.body?.email });
    const { externalToken, email } = req.body;
    
    if (!externalToken || !email) {
      return res.status(400).json({ message: 'Token externo e email são obrigatórios' });
    }
    
    // Validar o token externo com a API do controle interno
    try {
      // Fazer uma requisição para a API externa para validar o token
      const validateResponse = await fetch(`${EXTERNAL_API_URL}/validate-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${externalToken}`
        }
      });
      
      if (!validateResponse.ok) {
        return res.status(401).json({ message: 'Token externo inválido' });
      }
      
      // Obter dados do usuário da API externa
      const userResponse = await fetch(`${EXTERNAL_API_URL}/user`, {
        headers: {
          'Authorization': `Bearer ${externalToken}`
        }
      });
      
      if (!userResponse.ok) {
        return res.status(401).json({ message: 'Não foi possível obter dados do usuário externo' });
      }
      
      const externalUserData = await userResponse.json();
      
      // Extrair o ID do usuário externo
      const externalId = externalUserData.id || externalUserData.userId;
      
      if (!externalId) {
        return res.status(400).json({ message: 'ID do usuário externo não encontrado' });
      }
      
      // Verificar se já existe um usuário com este email
      let user = await User.findOne({ email });
      
      if (user) {
        // Se o usuário já existir, vincular o ID externo
        user.externalId = externalId;
        user.externalAuth = true;
        await user.save();
        logger.info('Existing user linked to external account', { userId: user._id, userName: user.name, email });
      } else {
        // Se o usuário não existir, criar um novo usuário
        user = await User.create({
          name: externalUserData.name || externalUserData.nome || 'Usuário',
          email,
          department: externalUserData.department || externalUserData.departamento || 'N/A',
          role: 'employee',
          externalId,
          externalAuth: true,
          // Senha não é necessária para usuários externos
          password: Math.random().toString(36).slice(-10) // Senha aleatória que nunca será usada
        });
        
        logger.info('New external user created with provided email', { userId: user._id, userName: user.name, email });
      }
      
      // Gerar token JWT para o usuário
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
      });
      
      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          externalAuth: user.externalAuth
        },
      });
    } catch (error) {
      logger.logError(error, { context: 'Validar token externo', email: email || req.body?.email || 'unknown' });
      return res.status(401).json({ message: 'Erro ao validar token externo' });
    }
  } catch (error) {
    logger.logError(error, { context: 'Link external account', email: req.body?.email });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Get current user
router.get('/me', protect, async (req, res) => {
  try {
    logger.debug('Get current user request', { userId: req.user._id, userName: req.user.name });
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      externalAuth: user.externalAuth,
      externalId: user.externalId
    });
  } catch (error) {
    logger.logError(error, { context: 'Get current user', userId: req.user?._id });
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Validar token JWT
router.get('/validate-token', protect, async (req, res) => {
  try {
    // Se chegou aqui, o token é válido (middleware protect já validou)
    res.status(200).json({ valid: true });
  } catch (error) {
    logger.logError(error, { context: 'Validate token', userId: req.user?._id });
    res.status(401).json({ valid: false });
  }
});

// Change password
router.patch('/change-password', protect, async (req, res) => {
  try {
    logger.debug('Change password request', { userId: req.user._id });
    const { oldPassword, newPassword } = req.body;
    
    // Get user with password field explicitly included
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    logger.debug('User found for password change', { userId: user._id, hasPassword: !!user.password });
    
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
    logger.logError(error, { context: 'Change password', userId: req.user?._id });
    res.status(500).json({ message: 'Erro ao alterar senha', error: error.message });
  }
});

export default router;
