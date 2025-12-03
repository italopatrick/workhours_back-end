/**
 * EXEMPLOS DE USO DO LOGGER
 * 
 * Este arquivo serve como documentação de como usar o logger
 * em diferentes situações no backend.
 */

import logger from './logger.js';

// 1. LOG SIMPLES (INFO)
logger.info('Operação realizada com sucesso');
logger.info('Usuário criado', { userId: '123', userName: 'João' });

// 2. LOG DE ERRO
try {
  // código que pode gerar erro
} catch (error) {
  logger.logError(error, { context: 'Criação de usuário', userId: '123' });
  // ou simplesmente:
  logger.error('Erro ao criar usuário', { error: error.message, userId: '123' });
}

// 3. LOG DE REQUEST
// Usar o middleware requestLogger no servidor para logs automáticos
// Ou manualmente:
logger.logRequest(req, 'Processando requisição de criação');

// 4. LOG DE AUTENTICAÇÃO
logger.logAuth('login', user, { ip: req.ip });
logger.logAuth('logout', user);

// 5. LOG DE BANCO DE DADOS
logger.logDatabase('find', 'users', { query: { role: 'admin' } });
logger.logDatabase('create', 'overtime', { recordId: '123' });

// 6. LOG DE WARNING
logger.warn('Limite de horas extras próximo', { 
  userId: '123',
  currentHours: 38,
  limit: 40
});

// 7. LOG DE DEBUG (apenas em desenvolvimento)
logger.debug('Valores intermediários', { 
  calculatedHours: 2.5,
  isValid: true
});

// 8. DIFERENTES NÍVEIS
logger.error('Erro crítico', { error: 'Falha na conexão' });
logger.warn('Atenção necessária', { message: 'Dados incompletos' });
logger.info('Informação geral', { message: 'Processo iniciado' });
logger.debug('Debug detalhado', { step: 1, data: {} });

// 9. LOG COM OBJETOS COMPLEXOS
logger.info('Operação complexa', {
  userId: '123',
  action: 'create_overtime',
  metadata: {
    hours: 2,
    date: '2025-12-01',
    status: 'pending'
  },
  timestamp: new Date().toISOString()
});

// OBSERVAÇÕES:
// - Logs são salvos automaticamente em logs/combined.log
// - Erros são salvos em logs/error.log
// - Console mostra logs coloridos e formatados
// - Use LOG_LEVEL=debug no .env para ver todos os logs
// - Use LOG_LEVEL=error no .env para ver apenas erros em produção

