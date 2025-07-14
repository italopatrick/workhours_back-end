import express from 'express';
import multer from 'multer';
import { protect, admin } from '../middleware/auth.js';
import { CompanySettings } from '../models/companySettings.js';

const router = express.Router();
const upload = multer();

// Obter configurações da empresa
router.get('/', protect, async (req, res) => {
  try {
    let settings = await CompanySettings.findOne();
    
    // Se não existir, cria com valores padrão
    if (!settings) {
      settings = await CompanySettings.create({
        name: 'Minha Empresa',
        reportHeader: '',
        reportFooter: ''
      });
    }

    // Não envia o buffer da imagem na consulta geral
    const response = {
      name: settings.name,
      reportHeader: settings.reportHeader,
      reportFooter: settings.reportFooter,
      hasLogo: !!settings.logo?.data
    };

    res.json(response);
  } catch (error) {
    console.error('Erro ao obter configurações:', error);
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
    console.error('Erro ao obter logo:', error);
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
    res.json({ message: 'Logo atualizada com sucesso' });
  } catch (error) {
    console.error('Erro ao fazer upload da logo:', error);
    res.status(500).json({ message: 'Erro ao fazer upload da logo' });
  }
});

// Atualizar configurações da empresa
router.put('/', protect, admin, upload.single('logo'), async (req, res) => {
  try {
    const { name, reportHeader, reportFooter, defaultOvertimeLimit } = req.body;
    let settings = await CompanySettings.findOne();

    if (!settings) {
      settings = new CompanySettings();
    }

    // Atualiza os campos de texto
    if (name) settings.name = name;
    if (reportHeader) settings.reportHeader = reportHeader;
    if (reportFooter) settings.reportFooter = reportFooter;
    if (defaultOvertimeLimit !== undefined) settings.defaultOvertimeLimit = Number(defaultOvertimeLimit);

    // Atualiza o logo se foi enviado
    if (req.file) {
      settings.logo = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    await settings.save();
    res.json({ message: 'Configurações atualizadas com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar configurações:', error);
    res.status(500).json({ message: 'Erro ao atualizar configurações' });
  }
});

export default router;
