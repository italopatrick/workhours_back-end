# 🗄️ Configuração do MongoDB na VPS para Easypanel

## 📋 Pré-requisitos

- MongoDB já instalado e rodando na sua VPS
- Acesso root ou sudo à VPS
- Conhecimento do IP da sua VPS

## 🔧 Configuração do MongoDB

### 1. Conectar ao MongoDB

```bash
# Se o MongoDB não tem autenticação
mongo

# Se já tem autenticação
mongo -u admin -p
```

### 2. Criar Banco e Usuário

```bash
# Selecionar/criar o banco workhours
use workhours

# Criar usuário específico para a aplicação
db.createUser({
  user: "workhours_user",
  pwd: "SUA_SENHA_SUPER_SEGURA_AQUI",
  roles: [
    { role: "readWrite", db: "workhours" }
  ]
})

# Verificar se o usuário foi criado
db.getUsers()
```

### 3. Testar a Conexão

```bash
# Sair do MongoDB
exit

# Testar conexão com o novo usuário
mongo workhours -u workhours_user -p
```

## 🔥 Configuração do Firewall

### Opção 1: Permitir IP específico (Mais Seguro)

```bash
# Descobrir o IP do Easypanel primeiro (veja nos logs após deploy)
# Então configure:
sudo ufw allow from IP_DO_EASYPANEL to any port 27017

# Verificar regras
sudo ufw status
```

### Opção 2: Abrir temporariamente (Menos Seguro)

```bash
# Abrir porta 27017 para todos (apenas temporariamente)
sudo ufw allow 27017

# Depois de descobrir o IP do Easypanel, remover:
sudo ufw delete allow 27017

# E adicionar regra específica:
sudo ufw allow from IP_DO_EASYPANEL to any port 27017
```

## 🌐 Configuração do MongoDB (mongodb.conf)

### Permitir Conexões Externas

```bash
# Editar arquivo de configuração
sudo nano /etc/mongod.conf
```

### Alterar estas configurações:

```yaml
# network interfaces
net:
  port: 27017
  bindIp: 0.0.0.0  # Permitir conexões externas (CUIDADO!)
  # bindIp: 127.0.0.1,IP_DA_SUA_VPS  # Mais seguro

# security
security:
  authorization: enabled  # Habilitar autenticação
```

### Reiniciar MongoDB

```bash
sudo systemctl restart mongod
sudo systemctl status mongod
```

## 🔗 String de Conexão para Easypanel

Use esta string no Easypanel (variável `MONGODB_URI`):

```
mongodb://workhours_user:SUA_SENHA_AQUI@IP_DA_SUA_VPS:27017/workhours
```

**Substitua:**
- `SUA_SENHA_AQUI` pela senha que você criou
- `IP_DA_SUA_VPS` pelo IP real da sua VPS

## 🧪 Teste da Configuração

### Teste Local da Conexão

```bash
# Instalar mongo shell se necessário
sudo apt install mongodb-clients

# Testar conexão
mongo "mongodb://workhours_user:SUA_SENHA@IP_DA_VPS:27017/workhours"
```

### Teste com Node.js

```javascript
// teste-conexao.js
const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://workhours_user:SUA_SENHA@IP_DA_VPS:27017/workhours';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Conexão com MongoDB funcionando!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro na conexão:', err);
    process.exit(1);
  });
```

```bash
# Executar teste
node teste-conexao.js
```

## 🔒 Dicas de Segurança

1. **Sempre use senhas fortes** (mínimo 16 caracteres)
2. **Configure firewall** para permitir apenas IPs específicos
3. **Use SSL/TLS** se possível
4. **Monitore conexões** regularmente
5. **Faça backups** regulares

## 🔍 Troubleshooting

### Erro: "connection refused"
- Verifique se o MongoDB está rodando: `sudo systemctl status mongod`
- Verifique se a porta 27017 está aberta: `sudo netstat -tlnp | grep 27017`

### Erro: "authentication failed"
- Verifique usuário e senha
- Confirme se o usuário foi criado no banco correto

### Erro: "timeout"
- Verifique configuração do firewall
- Confirme se o bindIp está configurado corretamente

## 📊 Monitoramento

### Verificar conexões ativas:
```bash
# Conectar ao MongoDB
mongo workhours -u workhours_user -p

# Ver conexões ativas
db.runCommand("currentOp")

# Ver estatísticas
db.stats()
```

### Logs do MongoDB:
```bash
# Ver logs
sudo tail -f /var/log/mongodb/mongod.log

# Procurar por conexões
sudo grep "connection" /var/log/mongodb/mongod.log
``` 