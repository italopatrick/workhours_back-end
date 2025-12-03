# 📝 Sistema de Logging - Backend

Este documento descreve o sistema de logging estruturado implementado no backend.

## 📦 Instalação

O logger utiliza a biblioteca **Winston** que já está instalada no projeto.

## 🎯 Funcionalidades

- ✅ **Logs estruturados** em formato JSON
- ✅ **Diferentes níveis** de log (error, warn, info, debug)
- ✅ **Arquivos separados** para erros e logs gerais
- ✅ **Console colorido** para desenvolvimento
- ✅ **Rotação automática** de arquivos (5MB por arquivo)
- ✅ **Contexto detalhado** em cada log

## 📁 Estrutura de Arquivos

```
logs/
  ├── error.log       # Apenas erros (nível error)
  └── combined.log    # Todos os logs (todos os níveis)
```

## 🔧 Configuração

### Variável de Ambiente

Adicione ao `.env`:

```env
# Nível de log: error, warn, info, debug
LOG_LEVEL=info
```

- **`error`**: Apenas erros (produção)
- **`warn`**: Warnings e erros
- **`info`**: Informações gerais (recomendado para produção)
- **`debug`**: Todos os logs (desenvolvimento)

## 📚 Uso Básico

### Importar o Logger

```javascript
import logger from '../utils/logger.js';
```

### Logs Simples

```javascript
// Informação geral
logger.info('Operação realizada com sucesso');

// Warning
logger.warn('Atenção: limite próximo');

// Erro
logger.error('Falha na operação');

// Debug (apenas em desenvolvimento)
logger.debug('Valores intermediários');
```

### Logs com Contexto

```javascript
// Com objeto de contexto
logger.info('Usuário criado', {
  userId: '123',
  userName: 'João Silva',
  email: 'joao@example.com'
});

// Log de erro com contexto
try {
  // código
} catch (error) {
  logger.logError(error, {
    context: 'Criação de usuário',
    userId: '123',
    additionalInfo: 'Falha ao salvar no banco'
  });
}
```

## 🛠️ Métodos Auxiliares

### 1. Log de Requisição HTTP

```javascript
logger.logRequest(req, 'Processando criação de hora extra');
// Loga: método, URL, IP, userAgent, userId
```

### 2. Log de Erro

```javascript
logger.logError(error, { context: 'Operação específica', userId: '123' });
// Loga: mensagem, stack trace e contexto
```

### 3. Log de Autenticação

```javascript
logger.logAuth('login', user, { ip: req.ip });
logger.logAuth('logout', user);
// Loga: ação, userId, email, role e detalhes adicionais
```

### 4. Log de Banco de Dados

```javascript
logger.logDatabase('find', 'users', { query: { role: 'admin' } });
logger.logDatabase('create', 'overtime', { recordId: '123' });
```

## 🔄 Middleware Automático

O middleware `requestLogger` já está configurado no servidor e loga automaticamente:

- ✅ Todas as requisições HTTP
- ✅ Método, URL, status code
- ✅ Tempo de resposta
- ✅ IP do cliente
- ✅ Usuário autenticado (se houver)

## 📊 Exemplos de Logs

### Console (Desenvolvimento)

```
2025-12-02 14:30:15 [info]: MongoDB Connected
  host: "localhost"
  port: 27017

2025-12-02 14:30:16 [info]: Incoming request
  method: "POST"
  url: "/api/overtime"
  ip: "127.0.0.1"
  userId: "507f1f77bcf86cd799439011"

2025-12-02 14:30:17 [error]: Token inválido
  error: "invalid signature"
  url: "/api/overtime"
```

### Arquivo (JSON)

```json
{
  "timestamp": "2025-12-02T14:30:15.123Z",
  "level": "info",
  "message": "MongoDB Connected",
  "host": "localhost",
  "port": 27017
}

{
  "timestamp": "2025-12-02T14:30:17.456Z",
  "level": "error",
  "message": "Token inválido",
  "error": "invalid signature",
  "url": "/api/overtime",
  "stack": "Error: invalid signature\n    at ..."
}
```

## 🎨 Substituindo console.log

### ❌ Antes

```javascript
console.log('Usuário criado:', user.name);
console.error('Erro:', error.message);
```

### ✅ Depois

```javascript
logger.info('Usuário criado', { userId: user._id, userName: user.name });
logger.logError(error, { context: 'Criação de usuário' });
```

## 📋 Níveis de Log

| Nível | Quando Usar | Exemplo |
|-------|-------------|---------|
| **error** | Erros que impedem a execução | Falha ao conectar no banco |
| **warn** | Situações que requerem atenção | Token expirado, limite próximo |
| **info** | Operações importantes | Usuário criado, hora extra aprovada |
| **debug** | Informações detalhadas | Valores intermediários, queries |

## 🔍 Boas Práticas

1. ✅ **Use contexto**: Sempre inclua informações relevantes
2. ✅ **Nível adequado**: Use o nível certo para cada situação
3. ✅ **Não logue dados sensíveis**: Senhas, tokens completos, etc.
4. ✅ **Logs descritivos**: Mensagens claras sobre o que aconteceu
5. ✅ **Structured logging**: Use objetos para contexto, não strings concatenadas

## 🚨 Tratamento de Erros

```javascript
try {
  // código que pode falhar
  const result = await someOperation();
  logger.info('Operação bem-sucedida', { resultId: result._id });
} catch (error) {
  logger.logError(error, {
    context: 'Nome da operação',
    userId: req.user?._id,
    additionalData: { /* dados relevantes */ }
  });
  
  // Retornar resposta adequada
  res.status(500).json({ message: 'Erro ao processar requisição' });
}
```

## 📝 Migração de Código Existente

Para migrar código existente, substitua:

```javascript
// console.log → logger.info
// console.error → logger.error ou logger.logError
// console.warn → logger.warn
```

O middleware `requestLogger` já substitui a necessidade de logar requisições manualmente.

## 🔒 Segurança

- ⚠️ **NÃO logue**:
  - Senhas ou hashes
  - Tokens JWT completos
  - Dados sensíveis de clientes
  - Informações de cartão de crédito

- ✅ **PODE logue**:
  - IDs de usuário
  - Ações realizadas
  - Erros (sem dados sensíveis)
  - Timestamps e métricas

## 📦 Estrutura de Logs

Os logs são salvos em:
- `logs/error.log` - Apenas erros (nível error)
- `logs/combined.log` - Todos os logs (todos os níveis)

Ambos os arquivos têm:
- Rotação automática (máx 5MB)
- Retenção (5 arquivos de erro, 10 arquivos gerais)
- Formato JSON estruturado

## 🎯 Próximos Passos

Para usar o logger em novos arquivos:

1. Importe: `import logger from '../utils/logger.js';`
2. Substitua `console.log` por `logger.info`
3. Use métodos auxiliares quando apropriado
4. Adicione contexto relevante

