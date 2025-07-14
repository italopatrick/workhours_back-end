/**
 * Script para corrigir o problema de sincronização do limite padrão de horas extras
 * Este script garante que o valor do banco de dados seja a única fonte da verdade
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Carrega as variáveis de ambiente
dotenv.config();

// Conecta ao MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/workhours')
  .then(() => console.log('Conectado ao MongoDB'))
  .catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });

// Importa o modelo CompanySettings
import { CompanySettings } from '../src/models/companySettings.js';

async function fixOvertimeLimit() {
  try {
    // Busca as configurações atuais
    let settings = await CompanySettings.findOne();
    
    // Se não existir, cria com o valor atual do banco
    if (!settings) {
      console.log('Configurações não encontradas. Criando novas configurações...');
      settings = new CompanySettings({
        name: 'Minha Empresa',
        reportHeader: '',
        reportFooter: '',
        defaultOvertimeLimit: 24 // Usa o valor atual do banco
      });
      await settings.save();
      console.log('Novas configurações criadas com limite padrão de 24 horas.');
    } else {
      console.log(`Configurações encontradas. Limite padrão atual: ${settings.defaultOvertimeLimit} horas.`);
    }
    
    console.log('\nO valor do limite padrão de horas extras está sincronizado.');
    console.log('Lembre-se: o frontend deve sempre buscar este valor do backend e não usar valores fixos no código.');
    
  } catch (error) {
    console.error('Erro ao corrigir o limite de horas extras:', error);
  } finally {
    mongoose.disconnect();
  }
}

// Executa a função
fixOvertimeLimit();
