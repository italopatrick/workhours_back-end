import dotenv from 'dotenv';

dotenv.config();

/**
 * Constrói a DATABASE_URL a partir de variáveis individuais ou usa a DATABASE_URL diretamente
 * @returns {string} URL de conexão do PostgreSQL
 */
export function getDatabaseUrl() {
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
  const url = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}`;
  
  // Adiciona timezone se especificado
  if (DB_TIMEZONE) {
    return `${url}&timezone=${encodeURIComponent(DB_TIMEZONE)}`;
  }

  return url;
}

// Exporta a URL construída
export const DATABASE_URL = getDatabaseUrl();

// Define no process.env para que o Prisma possa usar
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
}

