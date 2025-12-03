import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Definir formato personalizado para logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Formato para console (mais legível)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Adicionar metadados se existirem (filtrar campos internos do winston)
    const metaKeys = Object.keys(meta).filter(
      key => !key.startsWith('Symbol') && key !== 'splat' && key !== 'level' && key !== 'message'
    );
    if (metaKeys.length > 0) {
      const metaObj = {};
      metaKeys.forEach(key => {
        metaObj[key] = meta[key];
      });
      if (Object.keys(metaObj).length > 0) {
        msg += `\n${JSON.stringify(metaObj, null, 2)}`;
      }
    }
    
    return msg;
  })
);

// Configurar transportes - sempre começa com console
const transports = [
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'info'
  })
];

// Tentar adicionar transportes de arquivo apenas se for possível
try {
  const logsDir = path.join(__dirname, '../../logs');
  
  // Tentar criar diretório se não existir
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Verificar se podemos escrever
  fs.accessSync(logsDir, fs.constants.W_OK);
  
  // Adicionar transportes de arquivo
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 5242880,
      maxFiles: 5
    })
  );
  
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: logFormat,
      maxsize: 5242880,
      maxFiles: 10
    })
  );
} catch (error) {
  // Se falhar, continua apenas com console (silenciosamente)
}

// Criar instância do logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  exitOnError: false
});

// Métodos auxiliares (sem criar referências circulares)
logger.logRequest = function(req, message = '') {
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'],
    userAgent: req.headers['user-agent'],
    userId: req.user?._id || req.user?.id,
    message
  };
  
  this.info(message || `${req.method} ${req.originalUrl || req.url}`, logData);
};

logger.logError = function(error, context = {}) {
  const errorData = {
    message: error?.message || String(error),
    stack: error?.stack,
    ...context
  };
  
  this.error(error?.message || String(error), errorData);
};

logger.logAuth = function(action, user, details = {}) {
  this.info(`Auth: ${action}`, {
    action,
    userId: user?._id || user?.id,
    userEmail: user?.email,
    userRole: user?.role,
    ...details
  });
};

logger.logDatabase = function(operation, collection, details = {}) {
  this.debug(`DB: ${operation}`, {
    operation,
    collection,
    ...details
  });
};

export default logger;
