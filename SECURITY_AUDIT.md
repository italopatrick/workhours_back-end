# Relatório de Auditoria de Segurança - Backend

**Data:** 2025-01-05  
**Versão:** 1.0.0

## Resumo Executivo

Este relatório identifica vulnerabilidades de segurança no backend da aplicação Workhours. As vulnerabilidades foram categorizadas por severidade (Crítica, Alta, Média, Baixa) e incluem recomendações de correção.

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

### 3. **Vulnerabilidade no JWT (jws)**
**Severidade:** Crítica  
**Dependência:** `jws` (via `jsonwebtoken`)  
**CVE:** GHSA-869p-cjfg-cm3x  
**CVSS:** 7.5 (Alta)

**Problema:**
A biblioteca `jws` (usada pelo `jsonwebtoken`) tem vulnerabilidade de verificação incorreta de assinatura HMAC.

**Recomendação:**
```bash
npm update jsonwebtoken
npm audit fix
```

Verificar se a versão atualizada resolve a dependência vulnerável.

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

### 6. **Vulnerabilidade no jsPDF**
**Severidade:** Alta  
**Dependência:** `jspdf@3.0.1`  
**CVE:** GHSA-8mvj-3j78-4qmw  
**CVSS:** 7.5 (Alta)

**Problema:**
jsPDF tem vulnerabilidade de DoS (Denial of Service).

**Recomendação:**
```bash
npm update jspdf
npm audit fix
```

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

### 10. **Vulnerabilidade no Nodemailer**
**Severidade:** Média  
**Dependência:** `nodemailer@6.10.0`  
**Risco:** Potencial vulnerabilidade conhecida

**Recomendação:**
```bash
npm update nodemailer
npm audit fix
```

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

### 13. **Vulnerabilidade no brace-expansion**
**Severidade:** Baixa  
**Dependência:** `brace-expansion` (indireta)  
**CVE:** GHSA-v6h2-p8h4-qcjw  
**CVSS:** 3.1 (Baixa)

**Recomendação:**
```bash
npm audit fix
```

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

---

## 📋 Plano de Ação Prioritário

### Prioridade 1 (Imediato)
1. Remover exposição de `error.message` em produção
2. Atualizar dependências vulneráveis (`npm audit fix`)
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

```bash
# Atualizar dependências vulneráveis
npm audit fix

# Instalar pacotes de segurança
npm install express-rate-limit helmet express-validator

# Verificar vulnerabilidades
npm audit
```

---

## 📚 Referências

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

**Nota:** Este relatório foi gerado automaticamente. Recomenda-se revisão manual e testes de segurança adicionais antes de aplicar em produção.

