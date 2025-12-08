# 🔧 Guia de Configuração SMTP do Gmail

## ❌ Erro Comum: "Invalid login: 535-5.7.8 Username and Password not accepted"

Este erro ocorre quando o Gmail rejeita as credenciais. **NÃO é possível usar a senha normal da conta Gmail** para aplicações terceiras.

## ✅ Solução: Usar App Password (Senha de App)

### Passo 1: Ativar Autenticação em Duas Etapas (2FA)

1. Acesse: https://myaccount.google.com/security
2. Role até "Como fazer login no Google"
3. Clique em **"Verificação em duas etapas"**
4. Siga as instruções para ativar

### Passo 2: Gerar App Password

1. Acesse: https://myaccount.google.com/apppasswords
   - Ou vá em: Google Account → Security → 2-Step Verification → App passwords
2. Se não aparecer "App passwords":
   - Você precisa ativar a 2FA primeiro
   - Pode demorar alguns minutos após ativar
3. Selecione:
   - **App:** Mail
   - **Device:** Other (Custom name)
   - Digite: `PrimeTime WorkHours`
4. Clique em **"Generate"**
5. **Copie a senha de 16 caracteres** que aparece (ex: `abcd efgh ijkl mnop`)

### Passo 3: Configurar no .env

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=primetimesistema.rh@gmail.com
SMTP_PASS=abcdefghijklmnop  # ← Cole a senha de 16 caracteres (SEM espaços)
SMTP_FROM=primetimesistema.rh@gmail.com
```

**⚠️ IMPORTANTE:**
- Remova os espaços da senha (se tiver)
- Use apenas a senha de 16 caracteres, não a senha normal da conta
- A senha é diferente para cada app/device

## 🔍 Verificação e Troubleshooting

### Verificar se está configurado corretamente:

1. **Verifique as variáveis de ambiente:**
   ```bash
   # No container/logs, procure por:
   "Transporte SMTP configurado"
   ```

2. **Teste a conexão:**
   - O sistema faz verificação automática ao tentar enviar
   - Erros aparecem nos logs com detalhes

### Problemas Comuns:

#### ❌ "App passwords não aparece"
- **Causa:** 2FA não está totalmente ativado
- **Solução:** Aguarde alguns minutos e tente novamente

#### ❌ "Ainda dá erro de autenticação"
- **Causa 1:** Está usando a senha normal da conta
- **Solução:** Use a App Password gerada (16 caracteres)

- **Causa 2:** Senha tem espaços ou caracteres incorretos
- **Solução:** Copie exatamente a senha gerada (sem espaços)

- **Causa 3:** Variável não está sendo carregada
- **Solução:** Reinicie o container após alterar .env

#### ❌ "Funciona localmente mas não no servidor"
- **Causa:** Variáveis de ambiente diferentes
- **Solução:** Verifique as variáveis no ambiente de produção

## 📝 Configuração Alternativa (OAuth 2.0)

Para ambientes mais seguros, você pode usar OAuth 2.0 ao invés de App Password:

1. Criar credenciais OAuth no Google Cloud Console
2. Configurar redirect URI
3. Obter tokens de acesso/refresh

**Nota:** App Password é mais simples para maioria dos casos.

## 🚀 Outros Provedores SMTP

Se preferir outro provedor, ajuste as variáveis:

### Outlook/Office 365:
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_email@outlook.com
SMTP_PASS=sua_senha
```

### SendGrid:
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=sua_api_key_sendgrid
```

### Mailgun:
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@seu_dominio.mailgun.org
SMTP_PASS=sua_senha_mailgun
```

## 📚 Referências

- [Google App Passwords](https://support.google.com/accounts/answer/185833)
- [Gmail SMTP Settings](https://support.google.com/mail/answer/7126229)
- [Nodemailer Documentation](https://nodemailer.com/about/)

