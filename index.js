import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './src/routes/auth.routes.js';
import employeeRoutes from './src/routes/employee.routes.js';
import overtimeRoutes from './src/routes/overtime.routes.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server is running on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI ? 'Connected' : 'Not configured'}`);
});
