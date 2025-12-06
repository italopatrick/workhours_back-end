# Guia de Deploy - Migrations Automáticas

## ✅ Configuração de Deploy Automático

As migrations do Prisma serão executadas **automaticamente** em cada deploy através de:

### 1. Scripts do package.json

- **`postinstall`**: Executa `prisma generate` após `npm install`
- **`prestart`**: Executa `prisma migrate deploy` antes de iniciar o servidor

### 2. Dockerfile

O Dockerfile foi configurado para:
- Instalar dependências (incluindo Prisma CLI)
- Gerar Prisma Client durante o build
- Executar migrations via `docker-entrypoint.sh` antes de iniciar

### 3. Script de Entrada (docker-entrypoint.sh)

O script executa:
1. `prisma migrate deploy` - Aplica migrations pendentes
2. `npm start` - Inicia a aplicação

## 🔄 Como Funciona no Deploy

### Deploy com Docker:

```bash
# Build da imagem
docker build -t workhours-backend .

# Ao iniciar o container, o docker-entrypoint.sh:
# 1. Executa migrations automaticamente
# 2. Inicia o servidor
docker run workhours-backend
```

### Deploy com PM2:

```bash
# O script prestart executa migrations antes de iniciar
npm start
# ou
pm2 start ecosystem.config.js
```

### Deploy Manual:

```bash
# 1. Instalar dependências (gera Prisma Client)
npm install

# 2. Executar migrations
npm run prisma:deploy

# 3. Iniciar aplicação
npm start
```

## ⚠️ Importante

1. **Primeira Migration**: Execute manualmente a primeira vez:
   ```bash
   npx prisma migrate dev --name init
   ```

2. **Variáveis de Ambiente**: Certifique-se de que `DATABASE_URL` está configurada no ambiente de dev

3. **Permissões**: O script `docker-entrypoint.sh` precisa ter permissão de execução (já configurado no Dockerfile)

4. **Falhas de Migration**: Se a migration falhar, o script continua (com aviso), mas é recomendado verificar os logs

## 📝 Checklist de Deploy

- [ ] `DATABASE_URL` configurada no ambiente
- [ ] Primeira migration executada manualmente (se necessário)
- [ ] Dockerfile atualizado com Prisma
- [ ] docker-entrypoint.sh tem permissão de execução
- [ ] Variáveis de ambiente atualizadas (removido MONGODB_URI, adicionado DATABASE_URL)

## 🔍 Verificar Migrations

Para verificar o status das migrations:

```bash
npx prisma migrate status
```

Para ver migrations pendentes:

```bash
npx prisma migrate list
```

