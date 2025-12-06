# Migração de Dados MongoDB → PostgreSQL

Este diretório contém scripts para migrar dados do MongoDB para PostgreSQL, convertendo ObjectIds para UUIDs e mantendo todas as relações entre entidades.

## 📋 Pré-requisitos

1. **MongoDB**: Acesso ao banco de dados MongoDB de origem
2. **PostgreSQL**: Banco de dados PostgreSQL configurado e acessível
3. **Dependências**: 
   - `mongoose` (para conectar ao MongoDB)
   - `@prisma/client` e `prisma` (já instalados no projeto)
4. **Variáveis de Ambiente**:
   - `MONGODB_URI`: URI de conexão do MongoDB
   - `DATABASE_URL` ou variáveis `DB_*`: Configuração do PostgreSQL
5. **⚠️ IMPORTANTE**: Execute as migrations do Prisma ANTES de importar os dados:
   ```bash
   npx prisma migrate deploy
   ```
   Isso criará todas as tabelas necessárias no PostgreSQL.

## 📁 Estrutura de Arquivos

```
scripts/migrate/
├── export-mongodb.js      # Exporta dados do MongoDB para JSON
├── id-mapping.js          # Cria mapeamento ObjectId → UUID
├── transform-data.js      # Transforma dados para formato PostgreSQL
├── import-postgresql.js   # Importa dados no PostgreSQL
├── validate-migration.js  # Valida integridade da migração
├── migrate-data.js         # Script principal (orquestra tudo)
├── utils/
│   ├── mongo-connection.js
│   ├── prisma-connection.js
│   └── validators.js
├── data/                   # Dados exportados (JSON)
├── transformed/            # Dados transformados
├── id-mapping.json        # Mapeamento de IDs gerado
└── README.md              # Esta documentação
```

## 🚀 Uso

### Migração Completa

Execute o script principal para fazer toda a migração:

```bash
node scripts/migrate/migrate-data.js
```

Este comando executa todas as etapas:
1. Exporta dados do MongoDB
2. Cria mapeamento de ObjectIds para UUIDs
3. Transforma dados para formato PostgreSQL
4. Importa dados no PostgreSQL
5. Valida a migração

### Opções Disponíveis

#### `--dry-run`
Simula a migração sem inserir dados no PostgreSQL:

```bash
node scripts/migrate/migrate-data.js --dry-run
```

#### `--skip-export`
Pula a exportação e usa dados já exportados:

```bash
node scripts/migrate/migrate-data.js --skip-export
```

#### `--skip-validation`
Pula a validação final:

```bash
node scripts/migrate/migrate-data.js --skip-validation
```

#### `--collection <nome>`
Migra apenas uma coleção específica (funcionalidade futura):

```bash
node scripts/migrate/migrate-data.js --collection users
```

#### `--help` ou `-h`
Mostra ajuda:

```bash
node scripts/migrate/migrate-data.js --help
```

## 📝 Executando Etapas Individuais

Você também pode executar cada etapa separadamente:

### 1. Exportar do MongoDB

```bash
node scripts/migrate/export-mongodb.js
```

Exporta todas as coleções para arquivos JSON em `scripts/migrate/data/`.

### 2. Criar Mapeamento de IDs

```bash
node scripts/migrate/id-mapping.js
```

Gera o arquivo `id-mapping.json` com mapeamento de ObjectIds para UUIDs.

### 3. Transformar Dados

```bash
node scripts/migrate/transform-data.js
```

Transforma os dados exportados para o formato PostgreSQL e salva em `scripts/migrate/transformed/`.

### 4. Importar no PostgreSQL

```bash
node scripts/migrate/import-postgresql.js
```

Importa os dados transformados no PostgreSQL. Use `--dry-run` para simular:

```bash
node scripts/migrate/import-postgresql.js --dry-run
```

### 5. Validar Migração

```bash
node scripts/migrate/validate-migration.js
```

Compara contagens entre MongoDB e PostgreSQL e valida integridade referencial.

## 🔄 Ordem de Migração

Os dados são importados na seguinte ordem (respeitando foreign keys):

1. **Users** - Base para todas as outras tabelas
2. **CompanySettings** - Independente
3. **Overtimes** - Depende de Users
4. **HourBankRecords** - Depende de Users e Overtimes
5. **AuditLogs** - Depende de Users

## 🔍 Transformações Aplicadas

### User
- `_id` (ObjectId) → `id` (UUID)
- `password`: Mantido como está (já está hasheado)
- `overtimeExceptions`: Array → JSON
- `externalId`: Convertido para string se for number

### Overtime
- `_id` → `id` (UUID)
- `employeeId`: ObjectId → UUID
- `createdBy`, `approvedBy`, `rejectedBy`: ObjectId → UUID
- `approvedAt`, `rejectedAt`: ISODate → DateTime

### HourBankRecord
- `_id` → `id` (UUID)
- `employeeId`: ObjectId → UUID
- `overtimeRecordId`: ObjectId → UUID (pode ser null)
- `createdBy`, `approvedBy`, `rejectedBy`: ObjectId → UUID

### AuditLog
- `_id` → `id` (UUID)
- `entityId`: ObjectId → UUID (ou mantido como string)
- `userId`, `targetUserId`: ObjectId → UUID
- `metadata`: Object → JSON

### CompanySettings
- `_id` → `id` (UUID)
- `logo`: Buffer → Base64 → Buffer (BYTEA)
- `logoContentType`: Mantido

## ✅ Validações Realizadas

O script de validação verifica:

1. **Contagens**: Compara número de registros entre MongoDB e PostgreSQL
2. **Integridade Referencial**: Valida todas as foreign keys
3. **Unicidade**: Verifica emails e externalIds únicos
4. **Dados Críticos**: Valida campos obrigatórios e formatos

## ⚠️ Considerações Importantes

### Backup

**SEMPRE faça backup antes de migrar!**

```bash
# Backup do MongoDB
mongodump --uri="mongodb://..." --out=./backup-mongo

# Backup do PostgreSQL
pg_dump -h host -U user -d database > backup-postgres.sql
```

### Teste em Desenvolvimento

Teste a migração em ambiente de desenvolvimento antes de executar em produção.

### Janela de Manutenção

Planeje uma janela de manutenção para executar a migração em produção, considerando possível downtime.

### Rollback

Se algo der errado, você pode:

1. Restaurar backup do PostgreSQL
2. Limpar dados importados manualmente
3. Re-executar a migração após corrigir problemas

## 🐛 Troubleshooting

### Erro: "MONGODB_URI não está configurada"

Certifique-se de que a variável `MONGODB_URI` está configurada no `.env`:

```env
MONGODB_URI=mongodb://user:password@host:port/database
```

### Erro: "DATABASE_URL não está configurada"

Configure `DATABASE_URL` ou as variáveis `DB_*` no `.env`:

```env
DATABASE_URL=postgresql://user:password@host:port/database
```

Ou:

```env
DB_HOST=host
DB_PORT=5432
DB_USER=user
DB_PASSWORD=password
DB_NAME=database
```

### Erro: "Can't reach database server at `host:5432`"

Este erro indica que o PostgreSQL não está acessível externamente. Possíveis causas e soluções:

#### 1. **PostgreSQL não aceita conexões externas**

O PostgreSQL pode estar configurado para aceitar apenas conexões locais. Verifique o arquivo `postgresql.conf`:

```bash
# No servidor PostgreSQL, edite:
sudo nano /etc/postgresql/*/main/postgresql.conf

# Procure por:
listen_addresses = 'localhost'  # Mude para:
listen_addresses = '*'  # ou o IP específico
```

#### 2. **Firewall bloqueando a porta 5432**

Libere a porta no firewall:

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 5432/tcp

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=5432/tcp
sudo firewall-cmd --reload

# iptables
sudo iptables -A INPUT -p tcp --dport 5432 -j ACCEPT
```

#### 3. **PostgreSQL não permite conexões remotas**

Edite o arquivo `pg_hba.conf`:

```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf

# Adicione uma linha permitindo conexões:
host    all             all             0.0.0.0/0               md5
# ou para um IP específico:
host    all             all             SEU_IP/32              md5
```

Depois, reinicie o PostgreSQL:

```bash
sudo systemctl restart postgresql
```

#### 4. **Executar migração de dentro da rede/VPN**

Se o PostgreSQL estiver em uma rede privada, você pode:

- **Opção A**: Executar a migração de dentro da rede (SSH/VPN)
- **Opção B**: Usar um túnel SSH:

```bash
# Criar túnel SSH para o PostgreSQL
ssh -L 5432:localhost:5432 usuario@servidor-postgresql

# Em outro terminal, use localhost no .env:
DB_HOST=localhost
DB_PORT=5432
```

#### 5. **Verificar conectividade**

Teste se consegue alcançar o servidor:

```bash
# Testar porta
telnet easypanel.wkhs.cloud 5432
# ou
nc -zv easypanel.wkhs.cloud 5432

# Testar conexão PostgreSQL
psql -h easypanel.wkhs.cloud -p 5432 -U usuario -d database
```

#### 6. **Usar IP interno (Docker/Easypanel)**

Se estiver no Easypanel ou Docker, use o IP interno da rede:

```env
# Para containers no mesmo host Docker
DB_HOST=172.18.0.1  # ou 172.17.0.1
DB_PORT=5432

# Para serviços no Easypanel (mesma rede)
DB_HOST=nome-do-servico-postgresql  # nome do serviço
DB_PORT=5432
```

### Erro: "Foreign key constraint failed"

Isso pode acontecer se:
- A ordem de importação não foi respeitada
- Algum ObjectId não foi mapeado corretamente
- Dados corrompidos no MongoDB

**Solução**: Verifique os logs e o arquivo `id-mapping.json` para identificar o problema.

### Erro: "Email duplicado"

O PostgreSQL tem constraint de unicidade no email. Se houver emails duplicados no MongoDB, a migração falhará.

**Solução**: Limpe os dados duplicados no MongoDB antes de migrar.

### Dados não aparecem após migração

1. Verifique se a validação passou
2. Verifique os logs de importação
3. Execute a validação manualmente: `node scripts/migrate/validate-migration.js`

## 📊 Exemplo de Saída

```
🚀 Iniciando migração de dados MongoDB → PostgreSQL
📤 Etapa 1/5: Exportando dados do MongoDB...
✅ Exportação concluída { users: 50, overtimes: 200, ... }
🔄 Etapa 2/5: Criando mapeamento de ObjectIds para UUIDs...
✅ Mapeamento de IDs criado
🔄 Etapa 3/5: Transformando dados...
✅ Transformação concluída
📥 Etapa 4/5: Importando dados no PostgreSQL...
✅ Importação concluída { users: { imported: 50 }, ... }
✅ Etapa 5/5: Validando migração...
✅ Validação passou com sucesso!
🎉 Migração concluída com sucesso! { duration: "45.23s" }
```

## 🔗 Referências

- [Prisma Documentation](https://www.prisma.io/docs)
- [MongoDB Node.js Driver](https://www.mongodb.com/docs/drivers/node/current/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## 📞 Suporte

Se encontrar problemas, verifique:
1. Logs detalhados no console
2. Arquivos de erro em `scripts/migrate/data/` e `scripts/migrate/transformed/`
3. Validação manual executando `validate-migration.js`

