FROM node:18

# Cria o diretório de trabalho
WORKDIR /app

# Copia os arquivos do projeto
COPY package*.json ./
RUN npm install

COPY . .

# Exponha a porta definida no .env ou a padrão
EXPOSE 5000

CMD ["npm", "start"]
