# Primeira Migration - Instruções

## ✅ Migration Criada

A migration inicial foi criada e commitada no repositório:
- `prisma/migrations/20241205220000_init/migration.sql`

## 🚀 Aplicar a Migration

### No Ambiente de Dev (quando o servidor iniciar)

A migration será aplicada **automaticamente** quando o servidor iniciar, através do script `prestart` que executa:

```bash
npx prisma migrate deploy
```

### Aplicar Manualmente (se necessário)

Se precisar aplicar manualmente:

```bash
# Certifique-se de que DATABASE_URL está configurada
node build-database-url.js

# Aplicar migrations
npx prisma migrate deploy
```

## 📋 O que a Migration Cria

A migration inicial cria:

1. **Enums:**
   - `UserRole` (admin, employee)
   - `OvertimeStatus` (pending, approved, rejected)
   - `HourBankType` (credit, debit)
   - `HourBankStatus` (pending, approved, rejected)
   - `AuditAction` (16 tipos de ações)
   - `EntityType` (overtime, hourbank, employee, settings)

2. **Tabelas:**
   - `users` - Usuários do sistema
   - `overtimes` - Registros de horas extras
   - `hour_bank_records` - Registros do banco de horas
   - `audit_logs` - Logs de auditoria
   - `company_settings` - Configurações da empresa

3. **Índices e Foreign Keys:**
   - Todos os índices definidos no schema
   - Relacionamentos entre tabelas

## ⚠️ Importante

- A migration será aplicada automaticamente no próximo deploy
- Certifique-se de que `DATABASE_URL` ou variáveis individuais estão configuradas
- A primeira execução pode demorar um pouco para criar todas as tabelas

## 🔍 Verificar Status

Para verificar se as migrations foram aplicadas:

```bash
npx prisma migrate status
```

Para ver o histórico de migrations:

```bash
npx prisma migrate list
```

