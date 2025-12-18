import express from 'express';
import { protect, adminOrManager } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /justifications - Listar justificativas ativas
router.get('/', protect, async (req, res) => {
  try {
    const justifications = await prisma.justification.findMany({
      where: { isActive: true },
      orderBy: { reason: 'asc' }
    });
    
    res.json(justifications);
  } catch (error) {
    logger.logError(error, { context: 'Buscar justificativas', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao buscar justificativas', error: error.message });
  }
});

// POST /justifications - Criar justificativa (admin ou manager)
router.post('/', protect, adminOrManager, async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'O motivo da justificativa é obrigatório' });
    }
    
    const justification = await prisma.justification.create({
      data: {
        reason: reason.trim(),
        isActive: true
      }
    });
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'justification_created',
      entityType: 'settings',
      entityId: justification.id,
      userId: req.user.id,
      description: `Justificativa criada: ${reason.trim()}`,
      metadata: {
        reason: reason.trim()
      },
      ...requestMeta
    });
    
    res.status(201).json(justification);
  } catch (error) {
    logger.logError(error, { context: 'Criar justificativa', userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao criar justificativa', error: error.message });
  }
});

// PATCH /justifications/:id - Atualizar justificativa (admin ou manager)
router.patch('/:id', protect, adminOrManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'O motivo da justificativa é obrigatório' });
    }
    
    const justification = await prisma.justification.findUnique({
      where: { id }
    });
    
    if (!justification) {
      return res.status(404).json({ error: 'Justificativa não encontrada' });
    }
    
    const updatedJustification = await prisma.justification.update({
      where: { id },
      data: {
        reason: reason.trim()
      }
    });
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'justification_updated',
      entityType: 'settings',
      entityId: updatedJustification.id,
      userId: req.user.id,
      description: `Justificativa atualizada: ${reason.trim()}`,
      metadata: {
        oldReason: justification.reason,
        newReason: reason.trim()
      },
      ...requestMeta
    });
    
    res.json(updatedJustification);
  } catch (error) {
    logger.logError(error, { context: 'Atualizar justificativa', justificationId: req.params.id, userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao atualizar justificativa', error: error.message });
  }
});

// DELETE /justifications/:id - Desativar justificativa (admin ou manager)
router.delete('/:id', protect, adminOrManager, async (req, res) => {
  try {
    const { id } = req.params;
    
    const justification = await prisma.justification.findUnique({
      where: { id }
    });
    
    if (!justification) {
      return res.status(404).json({ error: 'Justificativa não encontrada' });
    }
    
    const updatedJustification = await prisma.justification.update({
      where: { id },
      data: {
        isActive: false
      }
    });
    
    // Registrar log de auditoria
    const requestMeta = getRequestMetadata(req);
    await logAudit({
      action: 'justification_deactivated',
      entityType: 'settings',
      entityId: updatedJustification.id,
      userId: req.user.id,
      description: `Justificativa desativada: ${justification.reason}`,
      metadata: {
        reason: justification.reason
      },
      ...requestMeta
    });
    
    res.json({ message: 'Justificativa desativada com sucesso', justification: updatedJustification });
  } catch (error) {
    logger.logError(error, { context: 'Desativar justificativa', justificationId: req.params.id, userId: req.user?.id });
    res.status(500).json({ message: 'Erro ao desativar justificativa', error: error.message });
  }
});

export default router;

