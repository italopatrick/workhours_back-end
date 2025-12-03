import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

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
    
    // Adicionar metadados se existirem
    if (Object.keys(meta).length > 0) {
      const metaStr = JSON.stringify(meta, null, 2);
      msg += `\n${metaStr}`;
    }
    
    return msg;
  })
);

// Criar diretório de logs se não existir
import fs from 'fs';
const logsDir = path.join(__dirname, '../../logs');
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (error) {
  // Se não conseguir criar o diretório, apenas loga no console
  console.warn('Não foi possível criar diretório de logs, usando apenas console:', error.message);
}

// Configurar transportes
const transports = [
  // Log no console (sempre presente)
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'info'
  })
];

// Adicionar transportes de arquivo apenas se o diretório existir e for possível escrever
try {
  if (fs.existsSync(logsDir) && fs.accessSync) {
    // Log de erros em arquivo separado
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    );
    
    // Todos os logs em um arquivo
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 10
      })
    );
  }
} catch (error) {
  // Se não conseguir adicionar transportes de arquivo, continua apenas com console
  console.warn('Não foi possível configurar logs em arquivo, usando apenas console');
}

// Criar instância do logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  // Não sair do processo em caso de erro
  exitOnError: false
});

// Adicionar métodos auxiliares para facilitar o uso
logger.logRequest = (req, message = '') => {
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'],
    userAgent: req.headers['user-agent'],
    userId: req.user?._id || req.user?.id,
    message
  };
  
  logger.info(message || `${req.method} ${req.originalUrl || req.url}`, logData);
};

logger.logError = (error, context = {}) => {
  const errorData = {
    message: error.message,
    stack: error.stack,
    ...context
  };
  
  logger.error(error.message, errorData);
};

logger.logAuth = (action, user, details = {}) => {
  logger.info(`Auth: ${action}`, {
    action,
    userId: user?._id || user?.id,
    userEmail: user?.email,
    userRole: user?.role,
    ...details
  });
};

logger.logDatabase = (operation, collection, details = {}) => {
  logger.debug(`DB: ${operation}`, {
    operation,
    collection,
    ...details
  });
};

export default logger;

