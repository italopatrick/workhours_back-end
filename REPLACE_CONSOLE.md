# Script de Substituição de Console.log

Este documento lista todas as substituições necessárias para migrar de console.log para logger estruturado.

## Padrões de Substituição

### 1. console.error → logger.logError ou logger.error

```javascript
// ❌ Antes
console.error('Erro ao buscar registros:', error);
console.error('Error:', error);

// ✅ Depois
logger.logError(error, { context: 'Buscar registros' });
// ou
logger.error('Erro ao buscar registros', { error: error.message });
```

### 2. console.log (info) → logger.info

```javascript
// ❌ Antes
console.log('Operação realizada');
console.log('Dados recebidos:', req.body);

// ✅ Depois
logger.info('Operação realizada');
logger.info('Dados recebidos', { body: req.body });
```

### 3. console.warn → logger.warn

```javascript
// ❌ Antes
console.warn('Limite excedido');

// ✅ Depois
logger.warn('Limite excedido', { limit: 40, current: 45 });
```

### 4. console.log (debug) → logger.debug

```javascript
// ❌ Antes
console.log('Valores intermediários:', data);

// ✅ Depois
logger.debug('Valores intermediários', { data });
```

## Arquivos a Substituir

1. ✅ `src/models/User.js` - COMPLETO
2. ✅ `src/middleware/auth.js` - COMPLETO  
3. ⏳ `src/routes/auth.routes.js` - EM ANDAMENTO
4. ⏳ `src/routes/overtime.routes.js` - PENDENTE
5. ⏳ `src/routes/hourBank.routes.js` - PENDENTE
6. ⏳ `src/routes/employee.routes.js` - PENDENTE
7. ⏳ `src/routes/settings.routes.js` - PENDENTE
8. ⏳ `src/routes/audit.routes.js` - PENDENTE

## Comandos Úteis

```bash
# Contar console.log/error restantes
grep -r "console\." src/ | wc -l

# Listar arquivos que ainda usam console
grep -r "console\." src/ --files-with-matches
```

