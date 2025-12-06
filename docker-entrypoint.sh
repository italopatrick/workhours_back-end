#!/bin/sh
set -e

echo "🚀 Iniciando aplicação..."

# Executar migrations do Prisma
echo "📦 Executando migrations do Prisma..."
npx prisma migrate deploy || {
  echo "⚠️  Aviso: Falha ao executar migrations. Continuando..."
}

# Iniciar a aplicação
echo "✅ Migrations concluídas. Iniciando servidor..."
exec npm start

