# 🚀 Guia de Configuração - Easypanel

## 📋 Pré-requisitos

- Conta no Easypanel
- Repositório Git do projeto
- Acesso SMTP (Gmail, SendGrid, etc.)

## 🔧 Configuração no Easypanel

### 1. Criando a Aplicação

1. **Login no Easypanel** e acesse seu projeto
2. **Clique em "Create Service"**
3. **Selecione "App"**
4. **Configure os dados básicos:**
   - **Name**: `workhours-backend`
   - **Source**: GitHub/GitLab (conecte seu repositório)
   - **Branch**: `main` ou `master`

### 2. Configurações de Build

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Port**: `5000`
- **Dockerfile**: Use o Dockerfile existente no projeto

### 3. Variáveis de Ambiente

Configure as seguintes variáveis no Easypanel:

#### 🔐 Configurações Básicas
```env
NODE_ENV=production
PORT=5000
```

#### 🗄️ Banco de Dados
```env
MONGODB_URI=mongodb://seu_usuario:sua_senha@seu_host:27017/workhours
```

#### 🔑 Autenticação
```env
JWT_SECRET=seu_jwt_secret_super_seguro_aqui_min_32_caracteres
```

#### 📧 Configurações de Email
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_senha_de_app_gmail
SMTP_FROM=seu_email@gmail.com
```

### 4. Configuração do MongoDB

#### Opção A: MongoDB na sua VPS (Recomendado se já tiver)
1. **Configure o usuário e senha** no seu MongoDB existente:
   ```bash
   # Conecte no MongoDB da sua VPS
   mongo
   
   # Crie o banco e usuário
   use workhours
   db.createUser({
     user: "workhours_user",
     pwd: "sua_senha_segura",
     roles: [{ role: "readWrite", db: "workhours" }]
   })
   ```

2. **Configure o firewall** para permitir conexões do Easypanel:
   ```bash
   # Abrir porta 27017 (certifique-se da segurança)
   sudo ufw allow from IP_DO_EASYPANEL to any port 27017
   ```

3. **String de conexão**:
   ```
   mongodb://workhours_user:sua_senha_segura@IP_DA_SUA_VPS:27017/workhours
   ```

#### Opção B: MongoDB Atlas (Se não tiver MongoDB na VPS)
1. Crie uma conta no [MongoDB Atlas](https://cloud.mongodb.com)
2. Crie um cluster gratuito
3. Configure o usuário e senha
4. Adicione o IP do Easypanel na whitelist (ou use 0.0.0.0/0)
5. Use a string de conexão no formato:
   ```
   mongodb+srv://usuario:senha@cluster.mongodb.net/workhours?retryWrites=true&w=majority
   ```

#### Opção C: MongoDB no Easypanel
1. Crie um novo serviço do tipo "Database"
2. Selecione MongoDB
3. Configure usuário e senha
4. Use a string de conexão interna do Easypanel

### 5. Configurações de Domínio

1. **Configure o domínio** na seção "Domains"
2. **Habilite HTTPS** (automático com Let's Encrypt)
3. **Configure redirects** se necessário

### 6. Health Check

O projeto já inclui health check configurado:
- **Endpoint**: `/api/auth/me`
- **Intervalo**: 30 segundos
- **Timeout**: 10 segundos

## 🔧 Comandos Úteis

### Build Local para Teste
```bash
# Build da imagem
docker build -t workhours-backend .

# Executar localmente
docker run -p 5000:5000 --env-file .env workhours-backend
```

### Docker Compose Local
```bash
# Subir todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f workhours-backend

# Parar serviços
docker-compose down
```

## 📝 Configuração do Gmail para SMTP

1. **Ative a verificação em 2 etapas** na sua conta Google
2. **Gere uma senha de app:**
   - Vá em "Configurações de conta" → "Segurança"
   - Clique em "Senhas de app"
   - Selecione "Email" e "Outro"
   - Digite "Workhours Backend"
   - Use a senha gerada no `SMTP_PASS`

## 🔒 Dicas de Segurança

1. **JWT_SECRET**: Use pelo menos 32 caracteres aleatórios
2. **MongoDB**: Sempre use usuário/senha forte
3. **SMTP**: Use senha de aplicativo, não sua senha pessoal
4. **Domínio**: Sempre use HTTPS em produção
5. **Firewall MongoDB**: Configure corretamente para permitir apenas conexões do Easypanel

### 📍 Como descobrir o IP do Easypanel

1. **Opção 1**: Veja nos logs do container após o deploy
2. **Opção 2**: Use `0.0.0.0/0` temporariamente e depois restrinja
3. **Opção 3**: Configure um IP específico nas configurações do Easypanel

### 🔧 Configuração de Firewall Segura

```bash
# Permitir apenas conexões do Easypanel (substitua pelo IP real)
sudo ufw allow from IP_DO_EASYPANEL to any port 27017

# Ou temporariamente (MENOS SEGURO)
sudo ufw allow 27017

# Verificar regras
sudo ufw status
```

### 🔐 Configuração MongoDB Segura

```bash
# Conectar ao MongoDB
mongo

# Criar usuário específico para a aplicação
use workhours
db.createUser({
  user: "workhours_user",
  pwd: "SUA_SENHA_SUPER_SEGURA_AQUI",
  roles: [
    { role: "readWrite", db: "workhours" }
  ]
})

# Verificar usuário criado
db.getUsers()
```

## 🎯 Primeiro Acesso

1. **Acesse**: `https://seu-dominio.com/api/auth/setup`
2. **Crie o primeiro admin** via POST:
   ```json
   {
     "name": "Administrador",
     "email": "admin@empresa.com",
     "password": "senha_forte_aqui",
     "department": "Administração"
   }
   ```

## 📊 Endpoints da API

- **Auth**: `/api/auth/*`
- **Funcionários**: `/api/employees/*`
- **Horas Extras**: `/api/overtime/*`
- **Relatórios**: `/api/reports/*`
- **Configurações**: `/api/settings/*`

## 🐛 Troubleshooting

### Problema de Conexão com MongoDB
- Verifique a string de conexão
- Confirme se o IP está na whitelist
- Teste a conexão manualmente

### Erro de Email
- Verifique as credenciais SMTP
- Confirme se a senha de app está correta
- Teste com um email de desenvolvimento

### Problemas de Build
- Verifique se todas as dependências estão no package.json
- Confirme se o Node.js está na versão correta
- Veja os logs de build no Easypanel

## 📞 Suporte

Para problemas específicos do Easypanel, consulte a [documentação oficial](https://easypanel.io/docs) ou o suporte da plataforma. 