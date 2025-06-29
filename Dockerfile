# Use uma imagem Node.js oficial
FROM node:18-alpine

# Criar usuário não-root por segurança
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && npm cache clean --force

# Copiar código da aplicação
COPY . .

# Mudar propriedade dos arquivos para o usuário nodejs
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expor a porta
EXPOSE 5000

# Definir variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=5000

# Comando para iniciar a aplicação
CMD ["npm", "start"]
