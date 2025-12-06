#!/bin/sh
set -e

echo "🚀 Iniciando aplicação..."

# Verificar se DATABASE_URL está configurada
if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  AVISO: DATABASE_URL não está configurada. Pulando migrations."
  echo "⚠️  Certifique-se de configurar DATABASE_URL no ambiente antes de iniciar."
else
  echo "📦 Executando migrations do Prisma..."
  echo "🔗 Database: ${DATABASE_URL%%@*}" # Mostra apenas user@host (sem senha)
  
  # Executar migrations do Prisma
  npx prisma migrate deploy || {
    echo "⚠️  Aviso: Falha ao executar migrations. Verifique os logs acima."
    echo "⚠️  Continuando com o servidor..."
  }
fi

# Iniciar a aplicação
echo "✅ Iniciando servidor..."
exec npm start

