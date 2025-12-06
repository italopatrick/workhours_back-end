# 🕐 Workhours Backend - Sistema de Gestão de Horas Extras

Sistema completo para gerenciamento de horas extras com autenticação, aprovação de solicitações, relatórios e configurações da empresa.

## 📋 Funcionalidades

- **🔐 Autenticação Externa** - Integração com API externa do sistema de controle interno
- **🔐 Autenticação JWT** - Login seguro com diferentes níveis de acesso (admin/employee)
- **👥 Gestão de Funcionários** - Cadastro e gerenciamento de usuários
- **⏰ Controle de Horas Extras** - Solicitação e aprovação de horas extras
- **🏦 Banco de Horas** - Controle de créditos e débitos no banco de horas
- **📊 Relatórios** - Geração de relatórios em PDF e CSV
- **📧 Notificações por Email** - Envio automático de relatórios
- **⚙️ Configurações** - Personalização da empresa (logo, cabeçalho, rodapé)
- **📝 Auditoria** - Logs completos de todas as ações do sistema

## 🚀 Deploy no Easypanel

### Pré-requisitos

- Conta no Easypanel
- Banco de dados PostgreSQL (pode ser serviço gerenciado ou próprio)
- Repositório Git (GitHub/GitLab)
- Email SMTP (Gmail recomendado)

### 1. Configuração do PostgreSQL

#### Opção A: Usando serviço gerenciado (recomendado)
- Crie um serviço PostgreSQL no Easypanel
- Anote as credenciais de conexão

#### Opção B: PostgreSQL próprio
Configure o PostgreSQL para aceitar conexões externas se necessário.

### 2. Deploy no Easypanel

#### Criar App:
1. **Login no Easypanel**
2. **Create Service** → **App**
3. **Configurações:**
   - **Name**: `workhours-backend`
   - **Source**: GitHub/GitLab
   - **Repository**: `seu-usuario/workhours_back-end`
   - **Branch**: `main` ou `developer`
   - **Build Context**: *(deixar vazio)*
   - **Dockerfile**: `Dockerfile`
   - **Port**: `5000`

#### Variáveis de Ambiente:
```env
NODE_ENV=production
PORT=5000

# PostgreSQL - Opção 1: DATABASE_URL completa
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=disable

# PostgreSQL - Opção 2: Variáveis individuais (alternativa)
DB_HOST=host
DB_PORT=5432
DB_USER=user
DB_PASSWORD=password
DB_NAME=database
DB_SSLMODE=disable
DB_TIMEZONE=America/Sao_Paulo

# Autenticação
JWT_SECRET=seu_jwt_secret_super_seguro_min_32_caracteres
EXTERNAL_API_URL=https://hall-api.azurewebsites.net/api

# CORS
ALLOWED_ORIGINS=https://primetimedev.workhours.com.br,https://primetime.workhours.com.br

# Email SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_de_app_gmail
SMTP_FROM=seu_email@gmail.com
```

#### Configuração SMTP (Gmail):
1. **Ative 2FA** na conta Google
2. **Gere senha de app:**
   - Google Account → Security → 2-Step Verification → App passwords
   - Selecione "Mail" → "Other" → Digite "Workhours"
   - Use a senha gerada no `SMTP_PASS`

### 3. Migrações do Banco de Dados

As migrações do Prisma são executadas automaticamente durante o deploy através do script `docker-entrypoint.sh`. 

**Primeira vez:**
- As tabelas serão criadas automaticamente na primeira execução
- Verifique os logs para confirmar que as migrations foram aplicadas

**Atualizações:**
- Novas migrations serão aplicadas automaticamente em cada deploy

## 🔧 Desenvolvimento Local

### Instalação:
```bash
# Clonar repositório
git clone https://github.com/seu-usuario/workhours_back-end.git
cd workhours_back-end

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações (veja seção abaixo)

# Gerar Prisma Client
npx prisma generate

# Executar migrations
npx prisma migrate dev

# Executar em desenvolvimento
npm run dev
```

### Configuração do Arquivo `.env`

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

#### PostgreSQL (obrigatório)

Você pode configurar de duas formas:

**Opção 1: DATABASE_URL completa (recomendado)**
```env
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=disable
```

**Opção 2: Variáveis individuais**
```env
DB_HOST=host
DB_PORT=5432
DB_USER=user
DB_PASSWORD=password
DB_NAME=database
DB_SSLMODE=disable
DB_TIMEZONE=America/Sao_Paulo
```

**Nota:** Se usar variáveis individuais, a `DATABASE_URL` será construída automaticamente.

#### MongoDB (apenas para migração de dados)

Necessário apenas se você estiver migrando dados de uma instalação antiga:

```env
MONGODB_URI=mongodb://user:password@host:port/database
```

#### Configurações do Servidor
```env
PORT=5000
HOST=0.0.0.0
NODE_ENV=development
```

#### Autenticação JWT
```env
JWT_SECRET=seu_jwt_secret_super_seguro_min_32_caracteres
```

#### CORS
```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

Para produção, use os domínios reais:
```env
ALLOWED_ORIGINS=https://primetimedev.workhours.com.br,https://primetime.workhours.com.br
```

#### API Externa (autenticação)
```env
EXTERNAL_API_URL=https://hall-api.azurewebsites.net/api
```

#### Email SMTP
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_de_app_gmail
SMTP_FROM=seu_email@gmail.com
```

#### Exemplo Completo de `.env`
```env
# PostgreSQL
DATABASE_URL=postgresql://postgres:senha@localhost:5432/workhours?sslmode=disable

# MongoDB (apenas para migração)
MONGODB_URI=mongodb://localhost:27017/workhours

# Servidor
PORT=5000
HOST=0.0.0.0
NODE_ENV=development

# Autenticação
JWT_SECRET=seu_jwt_secret_super_seguro_min_32_caracteres_aqui
EXTERNAL_API_URL=https://hall-api.azurewebsites.net/api

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_de_app_gmail
SMTP_FROM=seu_email@gmail.com
```

**⚠️ Importante:**
- Nunca commite o arquivo `.env` (já está no `.gitignore`)
- Altere o `JWT_SECRET` para um valor seguro em produção
- Use senha de aplicativo do Gmail, não senha pessoal
- Configure `ALLOWED_ORIGINS` com os domínios exatos do frontend

### Scripts Disponíveis:
```bash
npm start              # Inicia servidor em produção
npm run dev            # Inicia servidor em desenvolvimento (nodemon)
npx prisma studio      # Abre Prisma Studio (interface visual do banco)
npx prisma migrate dev # Cria e aplica nova migration
npx prisma migrate deploy # Aplica migrations em produção
```

### Docker Local:
```bash
# Build da imagem
docker build -t workhours-backend .

# Executar container
docker run -p 5000:5000 --env-file .env workhours-backend

# Ou usar Docker Compose
docker-compose up -d
```

## 📊 Migração de Dados (MongoDB → PostgreSQL)

Se você está migrando dados de uma instalação antiga que usava MongoDB, consulte a documentação completa em:

📖 **[scripts/migrate/README.md](scripts/migrate/README.md)**

### Resumo rápido:
```bash
# 1. Executar migrations do Prisma primeiro
npx prisma migrate deploy

# 2. Executar migração de dados
node scripts/migrate/migrate-data.js

# 3. Validar migração
node scripts/migrate/validate-migration.js
```

## 📚 API Endpoints

### Autenticação (`/api/auth`)
- `POST /setup` - Criar primeiro admin
- `POST /login` - Login de usuários
- `POST /external-login` - Login via API externa
- `GET /me` - Dados do usuário atual
- `PATCH /change-password` - Alterar senha
- `POST /link-external-account` - Vincular conta externa

### Funcionários (`/api/employees`)
- `GET /` - Listar funcionários
- `POST /` - Criar funcionário (admin)
- `PATCH /:id` - Atualizar funcionário (admin)
- `DELETE /:id` - Deletar funcionário (admin)

### Horas Extras (`/api/overtime`)
- `GET /` - Listar registros (com filtros)
- `GET /my` - Registros do usuário atual
- `POST /` - Criar registro
- `PATCH /:id` - Atualizar status (admin)
- `POST /send-report` - Enviar relatório por email

### Banco de Horas (`/api/hourbank`)
- `GET /` - Listar registros
- `POST /credit` - Criar crédito
- `POST /debit` - Criar débito
- `PATCH /:id` - Atualizar status (admin)

### Relatórios (`/api/reports`)
- `GET /pdf` - Gerar relatório PDF
- `GET /csv` - Gerar relatório CSV

### Configurações (`/api/settings`)
- `GET /` - Obter configurações da empresa
- `GET /logo` - Obter logo da empresa
- `POST /logo` - Upload do logo (admin)
- `PUT /` - Atualizar configurações (admin)

### Auditoria (`/api/audit`)
- `GET /` - Listar logs de auditoria (com filtros)

## 🎯 Primeiro Acesso

### Criar usuário administrador:
```bash
# POST para https://seu-dominio.com/api/auth/setup
{
  "name": "Administrador",
  "email": "admin@empresa.com",
  "password": "senha_forte_aqui",
  "department": "Administração"
}
```

### Testar login:
```bash
# POST para https://seu-dominio.com/api/auth/login
{
  "email": "admin@empresa.com",
  "password": "senha_forte_aqui"
}
```

## 🔒 Segurança

### Autenticação Externa

O sistema utiliza exclusivamente a API externa do sistema de controle interno para autenticação:

- **Integração Completa**: Autenticação exclusiva via API externa do controle interno
- **Mapeamento de Departamentos**: Conversão automática de IDs para nomes de departamentos
- **Controle de Papéis**: Definição de papéis (admin/employee) com base em IDs de usuário
- **Proxy Seguro**: Backend atua como proxy para evitar problemas de CORS

### Configurações de Segurança

- **JWT_SECRET**: Use pelo menos 32 caracteres aleatórios
- **EXTERNAL_API_URL**: URL da API externa do controle interno
- **DATABASE_URL**: Use SSL em produção (`sslmode=require`)
- **SMTP**: Use senha de aplicativo, não senha pessoal
- **Firewall**: Configure adequadamente para permitir apenas conexões necessárias
- **HTTPS**: Sempre use HTTPS em produção (automático no Easypanel)
- **CORS**: Configure `ALLOWED_ORIGINS` com domínios específicos

## 🛠️ Tecnologias

- **Node.js** - Runtime JavaScript
- **Express** - Framework web
- **PostgreSQL** - Banco de dados relacional
- **Prisma** - ORM moderno para TypeScript/JavaScript
- **API Externa** - Autenticação via sistema de controle interno
- **JWT** - Autenticação local após validação externa
- **BCrypt** - Hash de senhas
- **Nodemailer** - Envio de emails
- **PDFKit** - Geração de PDFs
- **Multer** - Upload de arquivos
- **Winston** - Sistema de logging
- **Docker** - Containerização

## 🐛 Troubleshooting

### Erro de conexão PostgreSQL:
- Verifique se PostgreSQL está rodando
- Confirme as credenciais em `DATABASE_URL` ou variáveis `DB_*`
- Teste conexão: `psql -h host -U user -d database`
- Verifique firewall se estiver acessando remotamente

### Erro de migrations:
- Verifique se `DATABASE_URL` está configurada
- Execute manualmente: `npx prisma migrate deploy`
- Verifique logs do container para erros específicos

### Erro de email:
- Verifique credenciais SMTP
- Confirme senha de app do Gmail
- Teste com email de desenvolvimento

### Container não inicia:
- Verifique logs no Easypanel
- Confirme variáveis de ambiente
- Teste build local: `docker build -t test .`
- Verifique se migrations foram aplicadas

### CORS bloqueando requisições:
- Configure `ALLOWED_ORIGINS` com a URL exata do frontend
- Sem barra final na URL
- Reinicie o container após mudar variáveis

## 📄 Estrutura do Projeto

```
workhours_back-end/
├── src/
│   ├── config/              # Configurações (database, etc)
│   ├── middleware/          # Middlewares (auth, audit, logging)
│   ├── models/             # Modelos Prisma (helpers)
│   ├── routes/             # Rotas da API
│   ├── services/           # Serviços de negócio
│   ├── utils/              # Utilitários (logger, password, etc)
│   └── server.js          # Configuração do servidor
├── prisma/
│   ├── schema.prisma       # Schema do banco de dados
│   └── migrations/         # Migrations do Prisma
├── scripts/
│   └── migrate/            # Scripts de migração MongoDB → PostgreSQL
├── Dockerfile             # Configuração Docker
├── docker-compose.yml     # Docker Compose
├── docker-entrypoint.sh   # Script de inicialização
├── build-database-url.js  # Script para construir DATABASE_URL
├── package.json          # Dependências
└── README.md            # Esta documentação
```

## 📝 Documentação Adicional

- **[scripts/migrate/README.md](scripts/migrate/README.md)** - Guia completo de migração de dados MongoDB → PostgreSQL

## 📞 Suporte

Para problemas ou dúvidas:
1. Verifique os logs no Easypanel
2. Consulte a seção Troubleshooting
3. Verifique a documentação adicional
4. Teste localmente com Docker

## 📄 Licença

Este projeto está sob a licença MIT.
