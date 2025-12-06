import express from 'express';
import multer from 'multer';
import { protect, admin } from '../middleware/auth.js';
import { getOrCreateSettings } from '../models/companySettings.model.js';
import prisma from '../config/database.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import logger from '../utils/logger.js';

const router = express.Router();
// Configurar multer com limites apropriados para upload de imagens
const upload = multer({
  storage: multer.memoryStorage(), // Armazenar em memória como Buffer
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
    fields: 10,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Validar tipo de arquivo
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}. Use PNG, JPEG, JPG, GIF ou WEBP`), false);
    }
  }
});

// Obter configurações da empresa
router.get('/', protect, async (req, res) => {
  try {
    let settings = await getOrCreateSettings();

    // Não envia o buffer da imagem na consulta geral
    const response = {
      name: settings.name,
      reportHeader: settings.reportHeader,
      reportFooter: settings.reportFooter,
      defaultOvertimeLimit: settings.defaultOvertimeLimit || 40,
      defaultAccumulationLimit: settings.defaultAccumulationLimit || 0,
      defaultUsageLimit: settings.defaultUsageLimit || 0,
      hasLogo: !!settings.logo
    };

    res.json(response);
  } catch (error) {
    logger.logError(error, { context: 'Obter configurações da empresa' });
    res.status(500).json({ message: 'Erro ao obter configurações' });
  }
});

// Obter logo da empresa
router.get('/logo', protect, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    if (!settings?.logo) {
      return res.status(404).json({ message: 'Logo não encontrado' });
    }

    // Garantir que logo é um Buffer
    const logoBuffer = Buffer.isBuffer(settings.logo) 
      ? settings.logo 
      : Buffer.from(settings.logo);

    res.set('Content-Type', settings.logoContentType || 'image/png');
    res.set('Content-Length', logoBuffer.length);
    res.send(logoBuffer);
  } catch (error) {
    logger.logError(error, { context: 'Obter logo da empresa' });
    res.status(500).json({ message: 'Erro ao obter logo' });
  }
});

// Upload da logo da empresa
router.post('/logo', protect, admin, (req, res, next) => {
  upload.single('logo')(req, res, (err) => {
    if (err) {
      logger.logError(err, { context: 'Multer error', userId: req.user?.id });
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'Arquivo muito grande. Tamanho máximo: 5MB' });
        }
        return res.status(400).json({ message: `Erro no upload: ${err.message}` });
      }
      return res.status(400).json({ message: err.message || 'Erro ao processar arquivo' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      logger.warn('Tentativa de upload sem arquivo', { userId: req.user?.id });
      return res.status(400).json({ message: 'Nenhum arquivo enviado' });
    }

    let settings = await getOrCreateSettings();

    // Garantir que o buffer é um Buffer válido
    const logoBuffer = Buffer.isBuffer(req.file.buffer) 
      ? req.file.buffer 
      : Buffer.from(req.file.buffer);

    await prisma.companySettings.update({
      where: { id: settings.id },
      data: {
        logo: logoBuffer,
        logoContentType: req.file.mimetype
      }
    });
    
    logger.info('Logo atualizada com sucesso', {
      userId: req.user.id,
      contentType: req.file.mimetype,
      fileSize: req.file.size
    });
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'settings_logo_updated',
      entityType: 'settings',
      entityId: settings.id,
      userId: req.user.id,
      description: `Logo da empresa atualizada`,
      metadata: {
        contentType: req.file.mimetype,
        fileSize: req.file.size
      },
      ...requestMeta
    });

    res.json({ message: 'Logo atualizada com sucesso' });
  } catch (error) {
    logger.logError(error, { 
      context: 'Upload de logo', 
      userId: req.user?.id,
      fileInfo: req.file ? {
        mimetype: req.file.mimetype,
        size: req.file.size,
        fieldname: req.file.fieldname
      } : null
    });
    res.status(500).json({ 
      message: 'Erro ao fazer upload da logo',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Atualizar configurações da empresa
router.put('/', protect, admin, upload.single('logo'), async (req, res) => {
  try {
    const { name, reportHeader, reportFooter, defaultOvertimeLimit, defaultAccumulationLimit, defaultUsageLimit } = req.body;
    let settings = await getOrCreateSettings();

    // Salvar valores antigos para auditoria
    const oldValues = {
      name: settings.name,
      reportHeader: settings.reportHeader,
      reportFooter: settings.reportFooter,
      defaultOvertimeLimit: settings.defaultOvertimeLimit,
      defaultAccumulationLimit: settings.defaultAccumulationLimit,
      defaultUsageLimit: settings.defaultUsageLimit,
      hasLogo: !!settings.logo
    };

    // Preparar dados para atualização
    const updateData = {};
    
    if (name !== undefined) updateData.name = name || '';
    if (reportHeader !== undefined) updateData.reportHeader = reportHeader;
    if (reportFooter !== undefined) updateData.reportFooter = reportFooter;
    if (defaultOvertimeLimit !== undefined) updateData.defaultOvertimeLimit = Number(defaultOvertimeLimit);
    if (defaultAccumulationLimit !== undefined) updateData.defaultAccumulationLimit = Number(defaultAccumulationLimit);
    if (defaultUsageLimit !== undefined) updateData.defaultUsageLimit = Number(defaultUsageLimit);

    // Atualiza o logo se foi enviado
    let logoUpdated = false;
    if (req.file) {
      updateData.logo = req.file.buffer;
      updateData.logoContentType = req.file.mimetype;
      logoUpdated = true;
    }

    const updatedSettings = await prisma.companySettings.update({
      where: { id: settings.id },
      data: updateData
    });
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    const action = logoUpdated ? 'settings_logo_updated' : 'settings_updated';
    await logAudit({
      action,
      entityType: 'settings',
      entityId: settings.id,
      userId: req.user.id,
      description: `Configurações da empresa atualizadas${logoUpdated ? ' (incluindo logo)' : ''}`,
      metadata: {
        oldValues,
        newValues: {
          name: updatedSettings.name,
          reportHeader: updatedSettings.reportHeader,
          reportFooter: updatedSettings.reportFooter,
          defaultOvertimeLimit: updatedSettings.defaultOvertimeLimit,
          defaultAccumulationLimit: updatedSettings.defaultAccumulationLimit,
          defaultUsageLimit: updatedSettings.defaultUsageLimit,
          hasLogo: !!updatedSettings.logo
        },
        logoUpdated
      },
      ...requestMeta
    });

    res.json({ message: 'Configurações atualizadas com sucesso' });
  } catch (error) {
    logger.logError(error, { context: 'Atualizar configurações', userId: req.user?._id });
    res.status(500).json({ message: 'Erro ao atualizar configurações' });
  }
});

export default router;
