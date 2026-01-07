#!/bin/sh
set -e

echo "🚀 Iniciando aplicação..."

# Tentar construir DATABASE_URL a partir de variáveis individuais se não estiver configurada
if [ -z "$DATABASE_URL" ]; then
  echo "📝 DATABASE_URL não encontrada, tentando construir a partir de variáveis individuais..."
  
  if [ -n "$DB_HOST" ] && [ -n "$DB_USER" ] && [ -n "$DB_PASSWORD" ] && [ -n "$DB_NAME" ]; then
    DB_PORT=${DB_PORT:-5432}
    DB_SSLMODE=${DB_SSLMODE:-disable}
    DB_TIMEZONE=${DB_TIMEZONE:-America/Sao_Paulo}
    
    DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}&timezone=$(echo ${DB_TIMEZONE} | sed 's/ /%20/g')"
    export DATABASE_URL
    echo "✅ DATABASE_URL construída a partir de variáveis individuais"
  else
    echo "⚠️  AVISO: DATABASE_URL não está configurada e variáveis individuais não estão completas."
    echo "⚠️  Variáveis necessárias: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME"
    echo "⚠️  Pulando migrations."
  fi
fi

# Executar migrations se DATABASE_URL estiver disponível
if [ -n "$DATABASE_URL" ]; then
  echo "📦 Executando migrations do Prisma..."
  echo "🔗 Database: ${DB_HOST:-${DATABASE_URL%%@*}}" # Mostra host ou user@host (sem senha)
  
  # Resolver migrations falhadas primeiro
  echo "🔧 Verificando e resolvendo migrations falhadas..."
  node scripts/resolve-failed-migration.js || {
    echo "⚠️  Aviso: Falha ao resolver migrations falhadas. Continuando..."
  }
  
  # Executar migrations do Prisma
  npx prisma migrate deploy || {
    echo "⚠️  Aviso: Falha ao executar migrations. Verifique os logs acima."
    echo "⚠️  Tentando aplicar migration de justificativas diretamente..."
    node scripts/check-and-fix-migration.js || {
      echo "⚠️  Falha ao aplicar migration manualmente. Continuando com o servidor..."
    }
  }
  
  # Verificar e corrigir migration de justificativas mesmo se migrate deploy passar
  # (garantir que a tabela existe)
  echo "🔍 Verificando tabela time_clock_justifications..."
  node scripts/check-and-fix-migration.js || {
    echo "⚠️  Aviso: Falha ao verificar/criar tabela de justificativas."
  }
fi

# Iniciar a aplicação
echo "✅ Iniciando servidor..."
exec npm start

