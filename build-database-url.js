#!/usr/bin/env node
/**
 * Script para construir DATABASE_URL a partir de variáveis individuais
 * Usado no docker-entrypoint.sh e scripts de deploy
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar .env
dotenv.config({ path: join(__dirname, '.env') });

function getDatabaseUrl() {
  // Se DATABASE_URL já estiver configurada, usa ela
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Caso contrário, constrói a partir das variáveis individuais
  const {
    DB_HOST,
    DB_PORT = '5432',
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_SSLMODE = 'disable',
    DB_TIMEZONE = 'America/Sao_Paulo'
  } = process.env;

  // Valida se as variáveis obrigatórias estão presentes
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error(
      'DATABASE_URL ou variáveis DB_HOST, DB_USER, DB_PASSWORD, DB_NAME devem estar configuradas'
    );
  }

  // Constrói a URL no formato: postgresql://user:password@host:port/database?sslmode=disable
  let url = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}`;
  
  // Adiciona timezone se especificado
  if (DB_TIMEZONE) {
    url += `&timezone=${encodeURIComponent(DB_TIMEZONE)}`;
  }

  return url;
}

try {
  const databaseUrl = getDatabaseUrl();
  process.env.DATABASE_URL = databaseUrl;
  console.log('✅ DATABASE_URL configurada');
  // Não mostra a URL completa por segurança, apenas confirma
} catch (error) {
  console.error('❌ Erro ao configurar DATABASE_URL:', error.message);
  console.error('   Verifique se DATABASE_URL ou DB_HOST, DB_USER, DB_PASSWORD, DB_NAME estão configuradas');
  process.exit(1);
}

