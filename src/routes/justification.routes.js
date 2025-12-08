import express from 'express';
import { protect, admin } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { logAudit, getRequestMetadata } from '../middleware/audit.js';
import logger from '../utils/logger.js';

const router = express.Router();

// GET /api/justifications - Listar justificativas ativas
router.get('/', protect, async (req, res) => {
  try {
    const justifications = await prisma.timeClockJustification.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        reason: 'asc'
      }
    });

    res.json(justifications);
  } catch (error) {
    logger.logError(error, { context: 'Listar justificativas' });
    res.status(500).json({ error: 'Erro ao listar justificativas' });
  }
});

// POST /api/justifications - Criar nova justificativa (admin)
router.post('/', protect, admin, async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'Motivo da justificativa é obrigatório' });
    }

    // Verificar se já existe justificativa com o mesmo motivo
    const existing = await prisma.timeClockJustification.findUnique({
      where: { reason: reason.trim() }
    });

    if (existing) {
      return res.status(400).json({ error: 'Já existe uma justificativa com este motivo' });
    }

    const justification = await prisma.timeClockJustification.create({
      data: {
        reason: reason.trim(),
        isActive: true
      }
    });

    // Log de auditoria
    const metadata = getRequestMetadata(req);
    await logAudit({
      action: 'settings_updated', // Usar action existente, pode criar uma específica depois
      entityType: 'settings',
      entityId: justification.id,
      userId: req.user.id,
      description: `Justificativa criada: ${justification.reason}`,
      metadata: {
        reason: justification.reason
      },
      ...metadata
    });

    logger.info('Justificativa criada', {
      id: justification.id,
      reason: justification.reason,
      userId: req.user.id
    });

    res.status(201).json(justification);
  } catch (error) {
    logger.logError(error, { context: 'Criar justificativa' });
    res.status(500).json({ error: 'Erro ao criar justificativa' });
  }
});

// PATCH /api/justifications/:id - Atualizar justificativa (admin)
router.patch('/:id', protect, admin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, isActive } = req.body;

    const existing = await prisma.timeClockJustification.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Justificativa não encontrada' });
    }

    const updateData = {};

    if (reason !== undefined) {
      if (typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ error: 'Motivo da justificativa é obrigatório' });
      }

      // Verificar se já existe outra justificativa com o mesmo motivo
      const duplicate = await prisma.timeClockJustification.findUnique({
        where: { reason: reason.trim() }
      });

      if (duplicate && duplicate.id !== id) {
        return res.status(400).json({ error: 'Já existe outra justificativa com este motivo' });
      }

      updateData.reason = reason.trim();
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    const updated = await prisma.timeClockJustification.update({
      where: { id },
      data: updateData
    });

    // Log de auditoria
    const metadata = getRequestMetadata(req);
    await logAudit({
      action: 'settings_updated',
      entityType: 'settings',
      entityId: id,
      userId: req.user.id,
      description: `Justificativa atualizada: ${updated.reason}`,
      metadata: {
        reason: updated.reason,
        isActive: updated.isActive
      },
      ...metadata
    });

    logger.info('Justificativa atualizada', {
      id: updated.id,
      reason: updated.reason,
      isActive: updated.isActive,
      userId: req.user.id
    });

    res.json(updated);
  } catch (error) {
    logger.logError(error, { context: 'Atualizar justificativa' });
    res.status(500).json({ error: 'Erro ao atualizar justificativa' });
  }
});

// DELETE /api/justifications/:id - Desativar justificativa (admin)
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.timeClockJustification.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Justificativa não encontrada' });
    }

    // Desativar em vez de deletar (soft delete)
    const updated = await prisma.timeClockJustification.update({
      where: { id },
      data: { isActive: false }
    });

    // Log de auditoria
    const metadata = getRequestMetadata(req);
    await logAudit({
      action: 'settings_updated',
      entityType: 'settings',
      entityId: id,
      userId: req.user.id,
      description: `Justificativa desativada: ${updated.reason}`,
      metadata: {
        reason: updated.reason
      },
      ...metadata
    });

    logger.info('Justificativa desativada', {
      id: updated.id,
      reason: updated.reason,
      userId: req.user.id
    });

    res.json(updated);
  } catch (error) {
    logger.logError(error, { context: 'Desativar justificativa' });
    res.status(500).json({ error: 'Erro ao desativar justificativa' });
  }
});

export default router;

