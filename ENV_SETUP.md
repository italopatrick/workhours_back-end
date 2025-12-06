# Configuração do Arquivo .env

## Crie um arquivo `.env` na raiz do projeto com o seguinte conteúdo:

Você pode configurar o banco de dados de duas formas:

### Opção 1: Usando DATABASE_URL (recomendado)

```env
# ============================================
# PostgreSQL Database Configuration
# ============================================
# Formato: postgresql://user:password@host:port/database?sslmode=disable
DATABASE_URL="postgresql://evlove:8849e1f11e743d3d854f@wkhs_evlovedb-prod:5432/evlove?sslmode=disable"
```

### Opção 2: Usando variáveis individuais (alternativa)

```env
# ============================================
# PostgreSQL Database Configuration (Variáveis Individuais)
# ============================================
DB_HOST=workhours_primetimedb-dev
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=40e7db05128f520df3aa
DB_NAME=primetimedb-dev
DB_SSLMODE=disable
DB_TIMEZONE=America/Sao_Paulo
```

**Nota:** Se você usar variáveis individuais, a `DATABASE_URL` será construída automaticamente.

# ============================================
# Server Configuration
# ============================================
PORT=5000
HOST=0.0.0.0
NODE_ENV=development

# ============================================
# JWT Authentication
# ============================================
JWT_SECRET=your_jwt_secret_key_here_change_in_production

# ============================================
# CORS Configuration
# ============================================
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# ============================================
# External API Configuration (if applicable)
# ============================================
EXTERNAL_API_URL=https://hall-api.azurewebsites.net/api

# ============================================
# Email Configuration (SMTP)
# ============================================
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@example.com
SMTP_PASS=your_email_password
```

## Configuração do PostgreSQL

A `DATABASE_URL` está configurada com os valores fornecidos:

- **Host**: `wkhs_evlovedb-prod`
- **Port**: `5432`
- **User**: `evlove`
- **Password**: `8849e1f11e743d3d854f`
- **Database**: `evlove`
- **SSL Mode**: `disable`

### Formato da DATABASE_URL

```
postgresql://[user]:[password]@[host]:[port]/[database]?sslmode=[mode]
```

### Exemplo de construção manual (se necessário):

Se preferir construir a URL manualmente usando variáveis separadas:

```env
DB_HOST=wkhs_evlovedb-prod
DB_PORT=5432
DB_USER=evlove
DB_PASSWORD=8849e1f11e743d3d854f
DB_NAME=evlove
DB_SSLMODE=disable
DB_TIMEZONE=America/Sao_Paulo
```

E então construir a URL no código ou usar uma biblioteca para construir a URL.

## Importante

1. **Nunca commite o arquivo `.env`** - ele está no `.gitignore`
2. **Altere o `JWT_SECRET`** para um valor seguro em produção
3. **Ajuste as configurações de SMTP** com seus dados reais
4. **Verifique as `ALLOWED_ORIGINS`** para incluir os domínios do seu frontend

## Próximos Passos

Após criar o arquivo `.env`:

1. Execute `npx prisma generate` para gerar o Prisma Client
2. Execute `npx prisma migrate dev --name init` para criar as tabelas
3. Inicie o servidor com `npm run dev`

