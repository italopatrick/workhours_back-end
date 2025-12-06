# Migração MongoDB → PostgreSQL - Guia de Configuração

## ✅ Migração Concluída

A migração do código foi concluída com sucesso! Todos os arquivos foram atualizados para usar Prisma ao invés de Mongoose.

## 📋 Próximos Passos

### 1. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com:

```env
# PostgreSQL Connection
DATABASE_URL="postgresql://evlove:8849e1f11e743d3d854f@wkhs_evlovedb-prod:5432/evlove?sslmode=disable"

# JWT Secret (mantenha o existente)
JWT_SECRET=seu_jwt_secret_aqui

# Outras variáveis existentes...
```

### 2. Gerar Prisma Client

```bash
npx prisma generate
```

### 3. Criar Migration Inicial

```bash
npx prisma migrate dev --name init
```

Isso criará as tabelas no PostgreSQL baseado no schema Prisma.

### 4. (Opcional) Migrar Dados Existentes

Se você tem dados no MongoDB que precisam ser migrados, será necessário criar um script de migração separado.

## 🔄 Mudanças Realizadas

### Modelos
- ✅ User → Prisma User (com UUID)
- ✅ Overtime → Prisma Overtime
- ✅ HourBankRecord → Prisma HourBankRecord
- ✅ AuditLog → Prisma AuditLog
- ✅ CompanySettings → Prisma CompanySettings

### Rotas Atualizadas
- ✅ `/api/auth` - Autenticação
- ✅ `/api/employees` - Funcionários
- ✅ `/api/overtime` - Horas extras
- ✅ `/api/hour-bank` - Banco de horas
- ✅ `/api/settings` - Configurações
- ✅ `/api/audit` - Auditoria
- ✅ `/api/reports` - Relatórios

### Mudanças Importantes
- **IDs**: Agora são UUIDs (não mais ObjectId)
- **Queries**: `populate()` → `include`
- **Operadores**: `$gte`, `$lte` → `gte`, `lte`
- **Campos**: `_id` → `id`

## 🧪 Testar a Aplicação

Após configurar o banco de dados:

```bash
npm run dev
```

Teste todas as rotas da API para garantir que tudo está funcionando.

## 📝 Notas

- Os arquivos de modelo Mongoose foram removidos
- A dependência `mongoose` foi removida do `package.json`
- Todos os imports e referências ao Mongoose foram substituídos

