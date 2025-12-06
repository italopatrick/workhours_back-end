# Use uma imagem Node.js oficial
FROM node:20-alpine

# Configurar timezone para Brasil (GMT-3)
RUN apk add --no-cache tzdata
ENV TZ=America/Sao_Paulo

# Criar usuário não-root por segurança
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Copiar schema Prisma antes de instalar (necessário para postinstall)
COPY prisma ./prisma

# Instalar dependências (incluindo devDependencies para Prisma CLI)
RUN npm ci && npm cache clean --force

# Copiar código da aplicação
COPY . .

# Copiar e configurar script de entrada
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Prisma Client já foi gerado no postinstall, mas garantimos aqui também
RUN npx prisma generate

# Mudar propriedade dos arquivos para o usuário nodejs
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expor a porta
EXPOSE 5000

# Definir variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=5000

# Comando para iniciar a aplicação (executa migrations antes)
CMD ["/app/docker-entrypoint.sh"]
