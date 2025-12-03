# 🔐 Configuração de CORS - Backend

## Variável de Ambiente Necessária

### `ALLOWED_ORIGINS`

Lista de URLs permitidas para acessar o backend, separadas por vírgula.

## Exemplo para seu ambiente (Easypanel):

```env
ALLOWED_ORIGINS=https://primetimedev.workhours.com.br
```

Se tiver múltiplos frontends (ex: dev, staging, prod):

```env
ALLOWED_ORIGINS=https://primetimedev.workhours.com.br,https://primetime.workhours.com.br,https://primetime-staging.workhours.com.br
```

## Como Configurar no Easypanel:

1. Acesse seu projeto no Easypanel
2. Vá em **Environment Variables**
3. Adicione uma nova variável:
   - **Nome:** `ALLOWED_ORIGINS`
   - **Valor:** `https://primetimedev.workhours.com.br`
4. Salve e reinicie o container

## Exemplo Completo de Variáveis de Ambiente:

```env
# MongoDB
MONGODB_URI=mongodb://sua-uri-aqui

# CORS - URLs permitidas do frontend
ALLOWED_ORIGINS=https://primetimedev.workhours.com.br

# API Externa (para autenticação)
EXTERNAL_API_URL=https://hall-api.azurewebsites.net/api

# JWT Secret
JWT_SECRET=seu-secret-jwt-aqui

# Porta do servidor
PORT=5000

# Ambiente
NODE_ENV=production
```

## Formato da URL:

✅ **Correto:**
- `https://primetimedev.workhours.com.br` (sem barra final)
- `http://localhost:5173` (para desenvolvimento local)
- `https://primetimedev.workhours.com.br,http://localhost:5173` (múltiplas URLs)

❌ **Incorreto:**
- `https://primetimedev.workhours.com.br/` (com barra final)
- `https://primetimedev.workhours.com.br/api` (não incluir caminhos)

## Teste Rápido:

Após configurar, você pode testar se está funcionando:

```bash
# Deve retornar os headers de CORS corretos
curl -H "Origin: https://primetimedev.workhours.com.br" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type,Authorization" \
     -X OPTIONS \
     https://workhoursbackend-dev.ofo7op.easypanel.host/api/auth/external-login
```

## Troubleshooting:

### Erro: "No 'Access-Control-Allow-Origin' header"
- ✅ Verifique se a URL está exatamente igual (com ou sem `www`)
- ✅ Verifique se está usando `https://` ou `http://` corretamente
- ✅ Reinicie o container após adicionar a variável

### Permitir todas as origens (apenas para desenvolvimento):
```env
ALLOWED_ORIGINS=*
```
⚠️ **ATENÇÃO:** Use `*` apenas em desenvolvimento. Nunca em produção!

