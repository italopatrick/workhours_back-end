# 🕐 Workhours Backend - Sistema de Gestão de Horas Extras

Sistema completo para gerenciamento de horas extras com autenticação, aprovação de solicitações, relatórios e configurações da empresa.

## 📋 Funcionalidades

- **🔐 Autenticação JWT** - Login seguro com diferentes níveis de acesso
- **👥 Gestão de Funcionários** - Cadastro e gerenciamento de usuários
- **⏰ Controle de Horas Extras** - Solicitação e aprovação de horas extras
- **📊 Relatórios** - Geração de relatórios em PDF e CSV
- **📧 Notificações por Email** - Envio automático de relatórios
- **⚙️ Configurações** - Personalização da empresa (logo, cabeçalho, rodapé)

## 🚀 Deploy no Easypanel

### Pré-requisitos

- Conta no Easypanel
- VPS com MongoDB instalado
- Repositório Git (GitHub/GitLab)
- Email SMTP (Gmail recomendado)

### 1. Configuração do MongoDB na VPS

#### Criar banco e usuário (se necessário):
```bash
# Conectar ao MongoDB
mongo

# Criar banco workhours
use workhours

# Criar usuário (opcional, se tiver autenticação habilitada)
db.createUser({
  user: "workhours_user",
  pwd: "SUA_SENHA_AQUI",
  roles: [{ role: "readWrite", db: "workhours" }]
})

exit
```

#### Configurar MongoDB para aceitar conexões externas:
```bash
# Editar configuração
sudo nano /etc/mongod.conf
```

Configurar assim:
```yaml
net:
  port: 22030  # ou sua porta personalizada
  bindIp: 0.0.0.0  # Permitir conexões externas
```

```bash
# Reiniciar MongoDB
sudo systemctl restart mongod
sudo systemctl status mongod
```

### 2. Deploy no Easypanel

#### Criar App:
1. **Login no Easypanel**
2. **Create Service** → **App**
3. **Configurações:**
   - **Name**: `workhours-backend`
   - **Source**: GitHub/GitLab
   - **Repository**: `seu-usuario/workhours_back-end`
   - **Branch**: `main`
   - **Build Context**: *(deixar vazio)*
   - **Dockerfile**: `Dockerfile`
   - **Port**: `5000`

#### Variáveis de Ambiente:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://172.18.0.1:22030/workhours
JWT_SECRET=seu_jwt_secret_super_seguro_min_32_caracteres
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

### 3. Descobrir IP do MongoDB

#### Para containers no Easypanel, use:
- **`172.18.0.1`** (rede docker_gwbridge - mais comum)
- **`172.17.0.1`** (rede docker0 - alternativa)
- **IP interno da VPS** (execute `hostname -I` na VPS)

#### Testar conectividade:
```bash
# Na VPS, descobrir IP das redes Docker
ip a | grep docker

# Testar conexão MongoDB
mongo --host 172.18.0.1 --port 22030
```

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
# Editar .env com suas configurações

# Executar em desenvolvimento
npm run dev
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

## 📚 API Endpoints

### Autenticação (`/api/auth`)
- `POST /setup` - Criar primeiro admin
- `POST /login` - Login de usuários
- `GET /me` - Dados do usuário atual
- `PATCH /change-password` - Alterar senha

### Funcionários (`/api/employees`)
- `GET /` - Listar funcionários
- `POST /` - Criar funcionário (admin)
- `DELETE /:id` - Deletar funcionário (admin)

### Horas Extras (`/api/overtime`)
- `GET /` - Listar registros (com filtros)
- `GET /my` - Registros do usuário atual
- `POST /` - Criar registro
- `PATCH /:id` - Atualizar status (admin)
- `POST /send-report` - Enviar relatório por email

### Relatórios (`/api/reports`)
- `GET /pdf` - Gerar relatório PDF
- `GET /csv` - Gerar relatório CSV

### Configurações (`/api/settings`)
- `GET /` - Obter configurações da empresa
- `GET /logo` - Obter logo da empresa
- `POST /logo` - Upload do logo (admin)
- `PUT /` - Atualizar configurações (admin)

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

- **JWT_SECRET**: Use pelo menos 32 caracteres aleatórios
- **MongoDB**: Configure autenticação se necessário
- **SMTP**: Use senha de aplicativo, não senha pessoal
- **Firewall**: Configure adequadamente para permitir apenas conexões necessárias
- **HTTPS**: Sempre use HTTPS em produção (automático no Easypanel)

## 🛠️ Tecnologias

- **Node.js** - Runtime JavaScript
- **Express** - Framework web
- **MongoDB** - Banco de dados NoSQL
- **Mongoose** - ODM para MongoDB
- **JWT** - Autenticação
- **BCrypt** - Hash de senhas
- **Nodemailer** - Envio de emails
- **PDFKit** - Geração de PDFs
- **Multer** - Upload de arquivos
- **Docker** - Containerização

## 🐛 Troubleshooting

### Erro de conexão MongoDB:
- Verifique se MongoDB está rodando: `sudo systemctl status mongod`
- Confirme a porta: `sudo netstat -tlnp | grep mongo`
- Teste conexão: `mongo --host IP --port PORTA`

### Erro de email:
- Verifique credenciais SMTP
- Confirme senha de app do Gmail
- Teste com email de desenvolvimento

### Container não inicia:
- Verifique logs no Easypanel
- Confirme variáveis de ambiente
- Teste build local: `docker build -t test .`

## 📄 Estrutura do Projeto

```
workhours_back-end/
├── src/
│   ├── middleware/          # Middlewares de autenticação
│   ├── models/             # Modelos do MongoDB
│   ├── routes/             # Rotas da API
│   └── server.js          # Configuração do servidor
├── Dockerfile             # Configuração Docker
├── docker-compose.yml     # Docker Compose
├── package.json          # Dependências
└── README.md            # Documentação
```

## 📞 Suporte

Para problemas ou dúvidas:
1. Verifique os logs no Easypanel
2. Consulte a seção Troubleshooting
3. Teste localmente com Docker

## 📄 Licença

Este projeto está sob a licença MIT. 