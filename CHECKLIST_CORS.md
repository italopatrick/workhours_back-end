# ✅ Checklist para Resolver CORS

## Situação Atual:
- **Frontend:** `https://primetimedev.workhours.com.br`
- **Backend:** `https://workhoursbackend-dev.ofo7op.easypanel.host`
- **Erro:** CORS bloqueando requisições do frontend

## Passos para Resolver:

### 1. ✅ Backend - Configurar ALLOWED_ORIGINS

No **Easypanel do BACKEND**, adicione/modifique a variável:

```env
ALLOWED_ORIGINS=https://primetimedev.workhours.com.br
```

⚠️ **IMPORTANTE:** 
- Sem barra final (`/`)
- URL exata (com `https://`)
- Se tiver múltiplos ambientes, separe por vírgula

### 2. ✅ Backend - Atualizar Código

O código já foi atualizado e está no repositório. Você precisa:

**Opção A - Deploy Automático (Easypanel):**
- Certifique-se que o Easypanel está fazendo deploy da branch `developer`
- Faça um **Rebuild** do container do backend no Easypanel

**Opção B - Deploy Manual:**
```bash
cd /caminho/do/backend
git pull origin developer
# Reiniciar container/servidor
```

### 3. ✅ Backend - Reiniciar Container

No Easypanel:
1. Vá para o projeto do **BACKEND**
2. Clique em **Restart** ou **Redeploy**
3. Aguarde reiniciar completamente

### 4. ✅ Frontend - Verificar URL do Backend

No **Easypanel do FRONTEND**, verifique a variável:

```env
VITE_API_URL=https://workhoursbackend-dev.ofo7op.easypanel.host/api
```

### 5. ✅ Frontend - Rebuild

Se mudou a `VITE_API_URL`, precisa fazer **rebuild** do frontend:
- No Easypanel, clique em **Rebuild** no projeto do frontend
- Aguarde o build completar

⚠️ **IMPORTANTE:** O Vite compila a URL no build, então qualquer mudança na `VITE_API_URL` requer rebuild!

## Teste Rápido:

Após seguir todos os passos, teste:

1. Abra o console do navegador (F12)
2. Tente fazer login
3. Veja se ainda aparece erro de CORS

Se ainda aparecer, verifique os logs do backend para ver:
```
CORS: Origens permitidas configuradas { allowedOrigins: ['https://primetimedev.workhours.com.br'], count: 1 }
```

## Variáveis de Ambiente Finais:

### BACKEND:
```env
ALLOWED_ORIGINS=https://primetimedev.workhours.com.br
MONGODB_URI=mongodb://...
EXTERNAL_API_URL=https://hall-api.azurewebsites.net/api
JWT_SECRET=...
PORT=5001
NODE_ENV=production
```

### FRONTEND:
```env
VITE_API_URL=https://workhoursbackend-dev.ofo7op.easypanel.host/api
NODE_ENV=production
PORT=3000
```

## ⚠️ Lembre-se:

1. **Backend precisa ser REINICIADO** após mudar `ALLOWED_ORIGINS`
2. **Frontend precisa ser REBUILD** após mudar `VITE_API_URL`
3. **Código do backend precisa estar atualizado** (já está no repositório)

