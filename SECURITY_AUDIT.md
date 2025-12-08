# Relatório de Auditoria de Segurança - Backend

**Data:** 2025-01-05  
**Última Atualização:** 2025-01-05  
**Versão:** 1.1.0

## Resumo Executivo

Este relatório identifica vulnerabilidades de segurança no backend da aplicação Workhours. As vulnerabilidades foram categorizadas por severidade (Crítica, Alta, Média, Baixa) e incluem recomendações de correção.

### Status Atual:
- ✅ **Vulnerabilidades de Dependências:** 0 vulnerabilidades encontradas (todas corrigidas)
- ⚠️ **Vulnerabilidades de Código:** 12 vulnerabilidades identificadas (pendentes de correção)

---

## 🔴 Vulnerabilidades Críticas

### 1. **Exposição de Mensagens de Erro em Produção**
**Severidade:** Crítica  
**Localização:** Múltiplos arquivos de rotas  
**Risco:** Informações sensíveis sobre a estrutura interna podem ser expostas

**Problema:**
Várias rotas expõem `error.message` diretamente nas respostas, mesmo em produção:

```58:58:src/routes/auth.routes.js
    res.status(500).json({ message: 'Server error', error: error.message });
```

**Impacto:**
- Stack traces podem revelar estrutura de arquivos
- Mensagens de erro podem expor lógica de negócio
- Facilita ataques de enumeração

**Recomendação:**
- Remover `error.message` de todas as respostas em produção
- Usar apenas mensagens genéricas: `'Erro interno do servidor'`
- Manter detalhes apenas em logs internos

---

### 2. **Falta de Rate Limiting**
**Severidade:** Crítica  
**Localização:** Todas as rotas de autenticação  
**Risco:** Ataques de força bruta e DoS

**Problema:**
Não há limitação de taxa de requisições, permitindo:
- Tentativas ilimitadas de login
- Ataques de força bruta em senhas
- DoS (Denial of Service)

**Recomendação:**
```bash
npm install express-rate-limit
```

Implementar rate limiting em:
- `/api/auth/external-login` (5 tentativas/minuto)
- `/api/auth/setup` (1 tentativa/hora)
- `/api/auth/change-password` (5 tentativas/hora)
- Rotas gerais (100 requisições/minuto por IP)

---

### 3. **Vulnerabilidade no JWT (jws)** ✅ **CORRIGIDA**
**Severidade:** Crítica  
**Dependência:** `jws` (via `jsonwebtoken`)  
**CVE:** GHSA-869p-cjfg-cm3x  
**CVSS:** 7.5 (Alta)  
**Status:** ✅ Corrigida em 2025-01-05

**Problema:**
A biblioteca `jws` (usada pelo `jsonwebtoken`) tem vulnerabilidade de verificação incorreta de assinatura HMAC.

**Correção Aplicada:**
- Atualizado `jws` de `3.2.2` para `3.2.3` via `npm audit fix`
- Atualizado `jwa` de `1.4.1` para `1.4.2` (dependência)
- Verificado: `npm audit` retorna 0 vulnerabilidades

---

## 🟠 Vulnerabilidades Altas

### 4. **Falta de Headers de Segurança HTTP**
**Severidade:** Alta  
**Localização:** `src/server.js`  
**Risco:** Ataques XSS, clickjacking, MIME sniffing

**Problema:**
Não há headers de segurança configurados (Helmet.js).

**Recomendação:**
```bash
npm install helmet
```

Adicionar em `src/server.js`:
```javascript
import helmet from 'helmet';
app.use(helmet());
```

---

### 5. **Validação de Entrada Insuficiente**
**Severidade:** Alta  
**Localização:** Todas as rotas  
**Risco:** Injection attacks, dados inválidos

**Problema:**
- Não há validação de tipos de dados
- Não há sanitização de entrada
- Não há validação de formato (email, UUID, etc.)

**Exemplo problemático:**
```48:48:src/routes/employee.routes.js
    const { name, email, password, department, role, overtimeLimit } = req.body;
```

**Recomendação:**
```bash
npm install express-validator
```

Implementar validação em todas as rotas que recebem dados do usuário.

---

### 6. **Vulnerabilidade no jsPDF** ✅ **CORRIGIDA**
**Severidade:** Alta  
**Dependência:** `jspdf@3.0.1`  
**CVE:** GHSA-8mvj-3j78-4qmw  
**CVSS:** 7.5 (Alta)  
**Status:** ✅ Corrigida em 2025-01-05

**Problema:**
jsPDF tem vulnerabilidade de DoS (Denial of Service).

**Correção Aplicada:**
- Atualizado `jspdf` de `3.0.1` para `3.0.4` via `npm audit fix`
- Atualizado `@babel/runtime` de `7.27.0` para `7.28.4` (dependência)
- Verificado: `npm audit` retorna 0 vulnerabilidades

---

### 7. **CORS Permissivo para Requisições sem Origin**
**Severidade:** Alta  
**Localização:** `src/server.js`  
**Risco:** CSRF attacks

**Problema:**
```52:55:src/server.js
    // Permite requisições sem origin (mobile apps, Postman, etc)
    if (!origin) {
      return callback(null, true);
    }
```

**Recomendação:**
- Restringir requisições sem origin apenas para ambientes específicos
- Adicionar validação de origem em produção
- Considerar usar tokens CSRF para operações sensíveis

---

## 🟡 Vulnerabilidades Médias

### 8. **Exposição de Detalhes de Resposta da API Externa**
**Severidade:** Média  
**Localização:** `src/routes/auth.routes.js`  
**Risco:** Informação vazada sobre sistema externo

**Problema:**
```99:102:src/routes/auth.routes.js
          return res.status(403).json({ 
            message: 'Acesso negado pela API externa. O usuário não tem permissão para acessar o sistema.', 
            details: responseText 
          });
```

**Recomendação:**
- Remover `details: responseText` em produção
- Logar detalhes apenas internamente

---

### 9. **Falta de Validação de Tamanho de Upload**
**Severidade:** Média  
**Localização:** `src/routes/settings.routes.js`  
**Risco:** DoS via upload de arquivos grandes

**Problema:**
Embora haja limite de 5MB no Multer, não há validação adicional ou timeout.

**Recomendação:**
- Adicionar timeout para uploads
- Validar dimensões da imagem (largura/altura)
- Considerar processamento assíncrono para arquivos grandes

---

### 10. **Vulnerabilidade no Nodemailer** ✅ **CORRIGIDA**
**Severidade:** Média  
**Dependência:** `nodemailer@6.10.0`  
**Risco:** Potencial vulnerabilidade conhecida  
**Status:** ✅ Corrigida em 2025-01-05

**Problema:**
Nodemailer tinha vulnerabilidades de:
- Email para domínio não intencionado devido a conflito de interpretação
- DoS causado por chamadas recursivas no addressparser

**Correção Aplicada:**
- Atualizado `nodemailer` de `6.10.0` para `7.0.11` (breaking change)
- Verificado compatibilidade com código existente (createTransport e sendMail)
- Verificado: `npm audit` retorna 0 vulnerabilidades

**Nota:** Atualização para v7.x é uma breaking change, mas o uso atual no código é compatível.

---

### 11. **JWT Token com Expiração Longa (30 dias)**
**Severidade:** Média  
**Localização:** `src/routes/auth.routes.js`  
**Risco:** Tokens comprometidos permanecem válidos por muito tempo

**Problema:**
```41:43:src/routes/auth.routes.js
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });
```

**Recomendação:**
- Reduzir para 7 dias ou menos
- Implementar refresh tokens
- Adicionar revogação de tokens

---

### 12. **Falta de Validação de Email**
**Severidade:** Média  
**Localização:** Rotas de criação/atualização de usuários  
**Risco:** Dados inválidos no banco

**Recomendação:**
Validar formato de email antes de salvar:
```javascript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  return res.status(400).json({ message: 'Email inválido' });
}
```

---

## 🟢 Vulnerabilidades Baixas

### 13. **Vulnerabilidade no brace-expansion** ✅ **CORRIGIDA**
**Severidade:** Baixa  
**Dependência:** `brace-expansion` (indireta)  
**CVE:** GHSA-v6h2-p8h4-qcjw  
**CVSS:** 3.1 (Baixa)  
**Status:** ✅ Corrigida em 2025-01-05

**Problema:**
Vulnerabilidade de Regular Expression Denial of Service (ReDoS).

**Correção Aplicada:**
- Atualizado `brace-expansion` de `1.1.11` para `1.1.12` via `npm audit fix`
- Verificado: `npm audit` retorna 0 vulnerabilidades

---

### 14. **Logs Podem Conter Informações Sensíveis**
**Severidade:** Baixa  
**Localização:** `src/utils/logger.js`  
**Risco:** Vazamento de dados em logs

**Problema:**
Logs podem conter senhas, tokens ou dados pessoais se não filtrados.

**Recomendação:**
- Filtrar campos sensíveis antes de logar
- Não logar `password`, `token`, `authorization` headers
- Implementar sanitização de logs

---

### 15. **Falta de Validação de UUID**
**Severidade:** Baixa  
**Localização:** Rotas que recebem IDs  
**Risco:** Erros de banco de dados, possíveis injection

**Recomendação:**
Validar formato UUID antes de usar em queries:
```javascript
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

---

## ✅ Boas Práticas Já Implementadas

1. ✅ **Senhas hasheadas com bcryptjs**
2. ✅ **Autenticação JWT implementada**
3. ✅ **Middleware de proteção de rotas**
4. ✅ **Separação de roles (admin/employee)**
5. ✅ **Prisma protege contra SQL injection**
6. ✅ **CORS configurado (com ressalvas)**
7. ✅ **Logs estruturados**
8. ✅ **Auditoria de ações implementada**
9. ✅ **Validação de tipos de arquivo no upload**
10. ✅ **Todas as vulnerabilidades de dependências corrigidas (0 vulnerabilidades)**

## ✅ Vulnerabilidades de Dependências Corrigidas

**Data da Correção:** 2025-01-05  
**Status:** ✅ Todas as vulnerabilidades de dependências foram corrigidas

### Dependências Atualizadas:
- ✅ `jws`: `3.2.2` → `3.2.3` (via npm audit fix)
- ✅ `jwa`: `1.4.1` → `1.4.2` (dependência do jws)
- ✅ `jspdf`: `3.0.1` → `3.0.4` (via npm audit fix)
- ✅ `nodemailer`: `6.10.0` → `7.0.11` (breaking change, mas compatível)
- ✅ `nodemon`: `2.0.22` → `3.1.11` (devDependency)
- ✅ `brace-expansion`: `1.1.11` → `1.1.12` (via npm audit fix)
- ✅ `semver`: Atualizado via nodemon (vulnerabilidade alta corrigida)
- ✅ `simple-update-notifier`: Atualizado via nodemon

### Verificação:
```bash
npm audit
# Resultado: found 0 vulnerabilities
```

---

## 📋 Plano de Ação Prioritário

### Prioridade 1 (Imediato)
1. ✅ ~~Atualizar dependências vulneráveis (`npm audit fix`)~~ **CONCLUÍDO**
2. Remover exposição de `error.message` em produção
3. Implementar rate limiting nas rotas de autenticação
4. Adicionar Helmet.js para headers de segurança

### Prioridade 2 (Curto Prazo)
5. Implementar validação de entrada com express-validator
6. Corrigir CORS para não permitir requisições sem origin em produção
7. Reduzir tempo de expiração do JWT
8. Validar formato de email e UUID

### Prioridade 3 (Médio Prazo)
9. Implementar refresh tokens
10. Adicionar validação de dimensões de imagem
11. Filtrar dados sensíveis dos logs
12. Implementar CSRF tokens para operações críticas

---

## 🔧 Comandos para Correção Rápida

### ✅ Dependências (Já Corrigidas)
```bash
# Status atual: 0 vulnerabilidades
npm audit
# Resultado: found 0 vulnerabilities
```

### ⚠️ Próximas Correções Necessárias
```bash
# Instalar pacotes de segurança
npm install express-rate-limit helmet express-validator

# Verificar vulnerabilidades (já está limpo)
npm audit
```

---

## 📚 Referências

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

**Nota:** Este relatório foi gerado automaticamente. Recomenda-se revisão manual e testes de segurança adicionais antes de aplicar em produção.

