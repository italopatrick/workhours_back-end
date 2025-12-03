import AuditLog from '../models/AuditLog.js';

/**
 * Registra uma ação no log de auditoria
 * @param {Object} params - Parâmetros do log
 * @param {String} params.action - Tipo de ação (enum definido no modelo)
 * @param {String} params.entityType - Tipo de entidade (overtime, hourbank, employee, settings)
 * @param {String|ObjectId} params.entityId - ID da entidade afetada
 * @param {String|ObjectId} params.userId - ID do usuário que executou a ação
 * @param {String|ObjectId} [params.targetUserId] - ID do usuário afetado (opcional)
 * @param {String} params.description - Descrição da ação
 * @param {Object} [params.metadata] - Metadados adicionais
 * @param {String} [params.ipAddress] - IP de origem
 * @param {String} [params.userAgent] - User agent
 */
export async function logAudit({
  action,
  entityType,
  entityId,
  userId,
  targetUserId = null,
  description,
  metadata = {},
  ipAddress = null,
  userAgent = null
}) {
  try {
    const auditLog = new AuditLog({
      action,
      entityType,
      entityId,
      userId,
      targetUserId: targetUserId || null,
      description,
      metadata,
      ipAddress,
      userAgent
    });

    await auditLog.save();
    // Log apenas em caso de erro para não poluir os logs
  } catch (error) {
    // Não deve interromper o fluxo da aplicação se o log falhar
    // Usar console.error aqui para não criar loop infinito de logs
    console.error(`Erro ao criar log de auditoria: ${error.message}`, error);
  }
}

/**
 * Helper para extrair IP e User Agent da requisição
 * @param {Object} req - Objeto request do Express
 * @returns {Object} - { ipAddress, userAgent }
 */
export function getRequestMetadata(req) {
  return {
    ipAddress: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || null,
    userAgent: req.headers['user-agent'] || null
  };
}

