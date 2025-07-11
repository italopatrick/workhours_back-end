import express from 'express';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { getDepartmentName } from '../config/departments.js';
import { getUserRole } from '../config/userRoles.js';

// URL da API externa do controle interno
const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'https://hall-api.azurewebsites.net/api';

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

// Login via API externa do controle interno
router.post('/external-login', async (req, res) => {
  try {
    console.log('External login request received');
    const { login, password } = req.body;
    
    if (!login || !password) {
      return res.status(400).json({ message: 'Login e senha são obrigatórios' });
    }
    
    // Autenticar com a API externa
    try {
      console.log('Tentando autenticar com a API externa');
      console.log('URL da API externa:', EXTERNAL_API_URL);
      console.log('Dados de login:', { login, password: '***' });
      
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
      
      console.log('Status da resposta da API externa:', loginResponse.status);
      
      // Obter o texto da resposta primeiro
      const responseText = await loginResponse.text();
      
      if (!loginResponse.ok) {
        console.log('Falha na autenticação com a API externa:', responseText);
        return res.status(401).json({ message: 'Credenciais inválidas para o sistema externo', details: responseText });
      }
      
      // Tentar fazer parse do JSON
      let externalData;
      try {
        // Verificar se a resposta está vazia
        if (!responseText || responseText.trim() === '') {
          console.log('Resposta da API externa está vazia, mas o status é OK');
          // Como o status é 201, podemos assumir que a autenticação foi bem-sucedida
          // e criar um token manualmente
          externalData = {
            token: 'token-simulado-' + Date.now(),
            user: {
              id: login,
              name: 'Usuário ' + login,
              departmentId: 6 // Valor padrão
            }
          };
        } else {
          // Tentar fazer parse do JSON
          externalData = JSON.parse(responseText);
        }
        
        console.log('============= RESPOSTA COMPLETA DA API EXTERNA =============');
        console.log(JSON.stringify(externalData, null, 2));
        console.log('=========================================================');
      } catch (error) {
        console.error('Erro ao fazer parse da resposta JSON:', error);
        console.log('Resposta original:', responseText);
        
        // Como o status é 201, podemos assumir que a autenticação foi bem-sucedida
        // e criar um token manualmente
        externalData = {
          token: 'token-simulado-' + Date.now(),
          user: {
            id: login,
            name: 'Usuário ' + login,
            departmentId: 6 // Valor padrão
          }
        };
      }
      
      if (!externalData || !externalData.token) {
        return res.status(401).json({ message: 'Resposta inválida da API externa' });
      }
      
      const externalToken = externalData.token;
      console.log('Token externo obtido com sucesso');
      
      // Tentar obter dados do usuário diretamente da resposta de login
      let externalUserData;
      let externalId;
      
      if (externalData.user) {
        // Se a resposta de login já incluir dados do usuário
        console.log('Dados do usuário obtidos da resposta de login');
        console.log('Dados completos do usuário externo:', JSON.stringify(externalData.user, null, 2));
        externalUserData = externalData.user;
        externalId = externalUserData.id || externalUserData.userId;
      } else {
        // Se precisarmos fazer uma chamada separada para obter dados do usuário
        console.log('Tentando obter dados do usuário da API externa');
        try {
          const userResponse = await fetch(`${EXTERNAL_API_URL}/user`, {
            headers: {
              'Authorization': `Bearer ${externalToken}`
            }
          });
          
          console.log('Status da resposta de dados do usuário:', userResponse.status);
          
          if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.log('Falha ao obter dados do usuário:', errorText);
            
            // Tentar com /me em vez de /user
            console.log('Tentando com endpoint /me');
            const meResponse = await fetch(`${EXTERNAL_API_URL}/me`, {
              headers: {
                'Authorization': `Bearer ${externalToken}`
              }
            });
            
            if (!meResponse.ok) {
              console.log('Falha ao obter dados do usuário via /me:', await meResponse.text());
              return res.status(401).json({ message: 'Não foi possível obter dados do usuário externo' });
            }
            
            externalUserData = await meResponse.json();
            console.log('Dados do usuário obtidos via /me:', JSON.stringify(externalUserData, null, 2));
          } else {
            externalUserData = await userResponse.json();
            console.log('Dados do usuário obtidos via /user:', JSON.stringify(externalUserData, null, 2));
          }
          
          // Extrair o ID do usuário externo
          externalId = externalUserData.id || externalUserData.userId;
        } catch (error) {
          console.error('Erro ao obter dados do usuário:', error);
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
        console.log(`ID do departamento ${externalUserData.departmentId} mapeado para: ${userDepartment}`);
      } else if (externalUserData.department) {
        // Usar o departamento diretamente se disponível
        userDepartment = externalUserData.department;
      }
      
      console.log('Dados extraídos do usuário externo:');
      console.log('- Nome:', userName);
      console.log('- Email:', userEmail);
      console.log('- Departamento:', userDepartment);
      
      // Determinar o papel (role) do usuário com base no ID externo
      const userRole = getUserRole(externalId);
      console.log(`Papel do usuário ${externalId}: ${userRole}`);
      
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
        console.log('Novo usuário criado com ID externo:', externalId, 'e papel:', userRole);
      } else {
        // Atualizar dados do usuário existente
        user.name = userName;
        user.email = userEmail;
        user.department = userDepartment;
        user.externalAuth = true;
        user.role = userRole; // Atualizar papel com base no ID externo
        
        await user.save();
        console.log('Usuário existente atualizado com ID externo:', externalId, 'e papel:', userRole);
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
      console.error('Error validating external token:', error);
      return res.status(401).json({ message: 'Erro ao validar token externo' });
    }
  } catch (error) {
    console.error('External login error:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Rota para vincular conta externa com email
router.post('/link-external-account', async (req, res) => {
  try {
    console.log('Link external account request received');
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
        console.log('Existing user linked to external account:', user.name);
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
        
        console.log('New external user created with provided email:', user.name);
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
      console.error('Error validating external token:', error);
      return res.status(401).json({ message: 'Erro ao validar token externo' });
    }
  } catch (error) {
    console.error('Link external account error:', error);
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
      department: user.department,
      externalAuth: user.externalAuth,
      externalId: user.externalId
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Erro no servidor', error: error.message });
  }
});

// Validar token JWT
router.get('/validate-token', protect, async (req, res) => {
  try {
    // Se chegou aqui, o token é válido (middleware protect já validou)
    res.status(200).json({ valid: true });
  } catch (error) {
    console.error('Validate token error:', error);
    res.status(401).json({ valid: false });
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
