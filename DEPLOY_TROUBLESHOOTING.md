# Troubleshooting - Deploy e Migrations

## Erro: Environment variable not found: DATABASE_URL

### Problema
O Prisma não encontra a variável `DATABASE_URL` durante a execução das migrations.

### Soluções

#### 1. Verificar se DATABASE_URL está configurada no ambiente

**No Docker Compose:**
```yaml
environment:
  - DATABASE_URL=postgresql://user:password@host:port/database?sslmode=disable
```

**No ambiente de deploy:**
- Verifique se a variável está configurada no sistema de CI/CD
- Verifique se está no arquivo `.env` (não versionado)
- Verifique se está nas variáveis de ambiente do container

#### 2. Verificar ordem de execução

O script `docker-entrypoint.sh` agora verifica se `DATABASE_URL` existe antes de executar migrations.

#### 3. Executar migrations manualmente (se necessário)

Se as migrations não executarem automaticamente:

```bash
# Dentro do container ou ambiente
export DATABASE_URL="postgresql://user:password@host:port/database?sslmode=disable"
npx prisma migrate deploy
```

#### 4. Verificar logs

Os logs agora mostram:
- Se `DATABASE_URL` está configurada
- Se as migrations foram executadas com sucesso
- Avisos se algo falhar

### Checklist de Verificação

- [ ] `DATABASE_URL` está configurada no docker-compose.yml
- [ ] `DATABASE_URL` está configurada no ambiente de deploy
- [ ] Formato da URL está correto: `postgresql://user:password@host:port/database?sslmode=disable`
- [ ] Banco de dados PostgreSQL está acessível
- [ ] Credenciais estão corretas
- [ ] Porta do banco está aberta (5432)

### Exemplo de DATABASE_URL

```env
DATABASE_URL="postgresql://evlove:8849e1f11e743d3d854f@wkhs_evlovedb-prod:5432/evlove?sslmode=disable"
```

### Debug

Para verificar se a variável está disponível:

```bash
# No container
echo $DATABASE_URL

# Ou no docker-compose
docker-compose exec workhours-backend env | grep DATABASE_URL
```

