import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import overtimeRoutes from './routes/overtime.routes.js';
import reportRoutes from './routes/report.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import hourBankRoutes from './routes/hourBank.routes.js';
import auditRoutes from './routes/audit.routes.js';
import logger from './utils/logger.js';
import { requestLogger } from './middleware/requestLogger.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware (antes das rotas)
app.use(requestLogger);

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('MongoDB Connected', { host: conn.connection.host });
  } catch (error) {
    logger.logError(error, { context: 'MongoDB Connection' });
    process.exit(1);
  }
};

connectDB();

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

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info('Server started', {
    host: HOST,
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    mongodb: process.env.MONGODB_URI ? 'Connected' : 'Not configured'
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
