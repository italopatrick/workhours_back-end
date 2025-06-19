# Estágio de construção
FROM node:18 AS builder

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependências
COPY package*.json ./


# Instala as dependências
RUN npm install

# Copia o restante dos arquivos
COPY . .

# Estágio de produção
FROM node:18-slim

WORKDIR /app

# Copia os arquivos do estágio de construção
COPY --from=builder /app .

# Expõe a porta 5000
EXPOSE 5000

# Define o comando de inicialização
CMD ["npm", "start"]
