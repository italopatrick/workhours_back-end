import logger from '../utils/logger.js';

/**
 * Middleware para logar todas as requisições HTTP
 */
export const requestLogger = (req, res, next) => {
  // Capturar o tempo de início
  const startTime = Date.now();

  // Log da requisição recebida
  logger.logRequest(req, 'Incoming request');

  // Interceptar o fim da resposta
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;
    
    // Log da resposta
    logger.info('Request completed', {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for']
    });

    // Se for erro, logar com mais detalhes
    if (res.statusCode >= 400) {
      logger.warn('Request error', {
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: req.user?._id || req.user?.id
      });
    }

    // Chamar o método original
    return originalSend.call(this, body);
  };

  next();
};

