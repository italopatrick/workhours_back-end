import express from 'express';
import multer from 'multer';
import { protect, admin } from '../middleware/auth.js';
import { CompanySettings } from '../models/companySettings.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import logger from '../utils/logger.js';

const router = express.Router();
const upload = multer();

// Obter configurações da empresa
router.get('/', protect, async (req, res) => {
  try {
    let settings = await CompanySettings.findOne();
    
    // Se não existir, cria com valores padrão
    if (!settings) {
      settings = await CompanySettings.create({
        name: '',
        reportHeader: '',
        reportFooter: ''
      });
    }

    // Não envia o buffer da imagem na consulta geral
    const response = {
      name: settings.name,
      reportHeader: settings.reportHeader,
      reportFooter: settings.reportFooter,
      defaultOvertimeLimit: settings.defaultOvertimeLimit || 40,
      defaultAccumulationLimit: settings.defaultAccumulationLimit || 0,
      defaultUsageLimit: settings.defaultUsageLimit || 0,
      hasLogo: !!settings.logo?.data
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
    const settings = await CompanySettings.findOne();
    if (!settings?.logo?.data) {
      return res.status(404).json({ message: 'Logo não encontrado' });
    }

    res.set('Content-Type', settings.logo.contentType);
    res.send(settings.logo.data);
  } catch (error) {
    logger.logError(error, { context: 'Obter logo da empresa' });
    res.status(500).json({ message: 'Erro ao obter logo' });
  }
});

// Upload da logo da empresa
router.post('/logo', protect, admin, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhum arquivo enviado' });
    }

    const settings = await CompanySettings.findOne();
    if (!settings) {
      return res.status(404).json({ message: 'Configurações não encontradas' });
    }

    settings.logo = {
      data: req.file.buffer,
      contentType: req.file.mimetype
    };

    await settings.save();
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'settings_logo_updated',
      entityType: 'settings',
      entityId: settings._id,
      userId: req.user._id,
      description: `Logo da empresa atualizada`,
      metadata: {
        contentType: req.file.mimetype,
        fileSize: req.file.size
      },
      ...requestMeta
    });

    res.json({ message: 'Logo atualizada com sucesso' });
  } catch (error) {
    logger.logError(error, { context: 'Upload de logo', userId: req.user?._id });
    res.status(500).json({ message: 'Erro ao fazer upload da logo' });
  }
});

// Atualizar configurações da empresa
router.put('/', protect, admin, upload.single('logo'), async (req, res) => {
  try {
    const { name, reportHeader, reportFooter, defaultOvertimeLimit, defaultAccumulationLimit, defaultUsageLimit } = req.body;
    let settings = await CompanySettings.findOne();

    if (!settings) {
      settings = new CompanySettings();
    }

    // Salvar valores antigos para auditoria
    const oldValues = {
      name: settings.name,
      reportHeader: settings.reportHeader,
      reportFooter: settings.reportFooter,
      defaultOvertimeLimit: settings.defaultOvertimeLimit,
      defaultAccumulationLimit: settings.defaultAccumulationLimit,
      defaultUsageLimit: settings.defaultUsageLimit,
      hasLogo: !!settings.logo?.data
    };

    // Atualiza os campos de texto
    if (name !== undefined) settings.name = name || '';
    if (reportHeader !== undefined) settings.reportHeader = reportHeader;
    if (reportFooter !== undefined) settings.reportFooter = reportFooter;
    if (defaultOvertimeLimit !== undefined) settings.defaultOvertimeLimit = Number(defaultOvertimeLimit);
    if (defaultAccumulationLimit !== undefined) settings.defaultAccumulationLimit = Number(defaultAccumulationLimit);
    if (defaultUsageLimit !== undefined) settings.defaultUsageLimit = Number(defaultUsageLimit);

    // Atualiza o logo se foi enviado
    let logoUpdated = false;
    if (req.file) {
      settings.logo = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
      logoUpdated = true;
    }

    await settings.save();
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    const action = logoUpdated ? 'settings_updated' : 'settings_updated';
    await logAudit({
      action,
      entityType: 'settings',
      entityId: settings._id,
      userId: req.user._id,
      description: `Configurações da empresa atualizadas${logoUpdated ? ' (incluindo logo)' : ''}`,
      metadata: {
        oldValues,
        newValues: {
          name: settings.name,
          reportHeader: settings.reportHeader,
          reportFooter: settings.reportFooter,
          defaultOvertimeLimit: settings.defaultOvertimeLimit,
          defaultAccumulationLimit: settings.defaultAccumulationLimit,
          defaultUsageLimit: settings.defaultUsageLimit,
          hasLogo: !!settings.logo?.data
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
