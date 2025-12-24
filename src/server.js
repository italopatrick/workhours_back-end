import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import overtimeRoutes from './routes/overtime.routes.js';
import reportRoutes from './routes/report.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import hourBankRoutes from './routes/hourBank.routes.js';
import auditRoutes from './routes/audit.routes.js';
import justificationRoutes from './routes/justification.routes.js';
import timeclockRoutes from './routes/timeclock.routes.js';
import logger from './utils/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import { connectDB, disconnectDB } from './config/database.js';
import cron from 'node-cron';
import { createDailyTimeClockRecords } from './jobs/dailyTimeClockJob.js';

dotenv.config();

const app = express();

// Middleware CORS - permite requisições do frontend
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

logger.info('CORS: Origens permitidas configuradas', { allowedOrigins, count: allowedOrigins.length });

// Handler de OPTIONS PRIMEIRO - antes de qualquer outro middleware
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  
  logger.info('CORS: Preflight OPTIONS request recebida', { origin, allowedOrigins });
  
  if (origin) {
    const isAllowed = allowedOrigins.includes('*') || allowedOrigins.includes(origin);
    if (isAllowed) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
      res.header('Access-Control-Max-Age', '86400');
      logger.info('CORS: Preflight permitida', { origin });
    } else {
      logger.warn('CORS: Preflight bloqueada - origin não permitida', { origin, allowedOrigins });
    }
  }
  
  res.status(204).end();
});

// Configuração de CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Permite requisições sem origin (mobile apps, Postman, etc)
    if (!origin) {
      return callback(null, true);
    }
    
    // Permite todas as origens se configurado com '*'
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    // Verifica se a origem está na lista permitida
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS: Origin bloqueada - não está na lista permitida', { 
        origin, 
        allowedOrigins
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400
};

// Aplicar CORS
app.use(cors(corsOptions));

// Configurar body parser com limites maiores para uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (antes das rotas)
app.use(requestLogger);

// Database connection
connectDB().catch((error) => {
  logger.logError(error, { context: 'PostgreSQL Connection' });
  process.exit(1);
});

// Configurar job diário para criar registros automáticos de ponto
// Executa diariamente às 23:59 (antes da meia-noite para processar o dia atual)
cron.schedule('59 23 * * *', async () => {
  try {
    logger.info('Executando job diário de criação de registros de ponto automáticos');
    await createDailyTimeClockRecords();
    logger.info('Job diário de criação de registros de ponto concluído com sucesso');
  } catch (error) {
    logger.logError(error, { context: 'Erro ao executar job diário de criação de registros de ponto' });
  }
}, {
  scheduled: true,
  timezone: 'America/Sao_Paulo'
});

logger.info('Job diário de criação de registros de ponto configurado para executar às 23:59 (horário de Brasília)');

// Root route - Welcome message
app.get('/', (req, res) => {
  const now = new Date();
  const brasilTime = now.toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  res.json({
    message: '🚀 API Back-end Prime Time rodando com sucesso!',
    status: 'online',
    timestamp: brasilTime,
    timezone: 'GMT-3 (Brasil)'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/overtime', overtimeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/hour-bank', hourBankRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/justifications', justificationRoutes);
app.use('/api/timeclock', timeclockRoutes);

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info('Server started', {
    host: HOST,
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? 'Connected' : 'Not configured'
  });
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
  logger.logError(error, { context: 'Unhandled Rejection' });
});

process.on('uncaughtException', (error) => {
  logger.logError(error, { context: 'Uncaught Exception' });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await disconnectDB();
  process.exit(0);
});
