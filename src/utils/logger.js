import winston from 'winston';

// Formato simples para console
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    const metaKeys = Object.keys(meta).filter(
      key => !key.startsWith('Symbol') && key !== 'splat' && key !== 'level' && key !== 'message'
    );
    if (metaKeys.length > 0) {
      const metaObj = {};
      metaKeys.forEach(key => {
        if (typeof meta[key] !== 'undefined') {
          metaObj[key] = meta[key];
        }
      });
      if (Object.keys(metaObj).length > 0) {
        msg += ` ${JSON.stringify(metaObj)}`;
      }
    }
    return msg;
  })
);

// Criar logger básico apenas com console
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true })
  ),
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    })
  ],
  exitOnError: false
});

// Métodos auxiliares usando bind para evitar problemas
logger.logRequest = function(req, message = '') {
  logger.info(message || `${req.method} ${req.originalUrl || req.url}`, {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'],
    userAgent: req.headers['user-agent'],
    userId: req.user?._id || req.user?.id
  });
};

logger.logError = function(error, context = {}) {
  logger.error(error?.message || String(error), {
    stack: error?.stack,
    ...context
  });
};

logger.logAuth = function(action, user, details = {}) {
  logger.info(`Auth: ${action}`, {
    action,
    userId: user?._id || user?.id,
    userEmail: user?.email,
    userRole: user?.role,
    ...details
  });
};

logger.logDatabase = function(operation, collection, details = {}) {
  logger.debug(`DB: ${operation}`, {
    operation,
    collection,
    ...details
  });
};

export default logger;
