# Status dos Filtros de Departamento para Managers

## Resumo
Este documento descreve o status atual da implementação de filtros de departamento para usuários com role `manager` (gestor).

## Princípio
- **Admin**: Pode ver e gerenciar tudo (sem filtros)
- **Manager**: Pode ver e gerenciar apenas dados do seu próprio departamento
- **Employee**: Pode ver apenas seus próprios dados

## Status das Rotas

### ✅ Implementado Corretamente

#### 1. **GET /api/employees** (`employee.routes.js`)
- ✅ Manager vê apenas funcionários do seu departamento
- ✅ Ignora parâmetro `department` se diferente do departamento do manager
- **Linha**: 36-47

#### 2. **GET /api/overtime** (`overtime.routes.js`)
- ✅ Manager vê apenas horas extras de funcionários do seu departamento
- ✅ Filtra automaticamente por departamento
- **Linha**: 73-96

#### 3. **POST /api/overtime** (`overtime.routes.js`)
- ✅ Manager pode criar horas extras para funcionários do seu departamento
- ✅ Validação de departamento antes de criar
- **Linha**: 187-195

#### 4. **PATCH /api/overtime/:id** (`overtime.routes.js`)
- ✅ Manager pode aprovar/rejeitar horas extras do seu departamento
- ✅ Validação de departamento antes de aprovar
- **Linha**: 395-402

#### 5. **GET /api/timeclock/department-records** (`timeclock.routes.js`)
- ✅ Manager só pode ver registros do seu departamento
- ✅ Validação explícita de departamento
- **Linha**: 718-724

#### 6. **GET /api/timeclock/records/:employeeId** (`timeclock.routes.js`)
- ✅ Manager só pode ver registros de funcionários do seu departamento
- ✅ Usa `checkEmployeeDepartment` para validação
- **Linha**: 652-657

#### 7. **PATCH /api/timeclock/records/:recordId** (`timeclock.routes.js`)
- ✅ Manager só pode editar registros de funcionários do seu departamento
- ✅ Validação de departamento antes de editar
- **Linha**: 820-826

#### 8. **GET /api/reports/pdf** e **GET /api/reports/csv** (`report.routes.js`)
- ✅ Manager vê apenas relatórios do seu departamento
- ✅ Filtro aplicado automaticamente
- **Linha**: 19-25 (PDF), 77-83 (CSV)

#### 9. **GET /api/hour-bank/balance** (`hourBank.routes.js`)
- ✅ Manager pode ver saldo de funcionários do seu departamento
- ✅ Validação de departamento
- **Linha**: 74-82

#### 10. **GET /api/hour-bank/records** (`hourBank.routes.js`)
- ✅ Manager vê apenas registros do seu departamento
- ✅ Filtro aplicado automaticamente
- **Linha**: 133-149

#### 11. **POST /api/hour-bank/credit** e **POST /api/hour-bank/debit** (`hourBank.routes.js`)
- ✅ Manager pode criar créditos/débitos para funcionários do seu departamento
- ✅ Validação de departamento
- **Linha**: 258-268

#### 12. **PATCH /api/hour-bank/records/:id/status** (`hourBank.routes.js`)
- ✅ Manager pode aprovar/rejeitar registros do seu departamento
- ✅ Validação de departamento
- **Linha**: 523-529

#### 13. **GET /api/hour-bank/limits** (`hourBank.routes.js`)
- ✅ Manager pode verificar limites de funcionários do seu departamento
- ✅ Validação de departamento
- **Linha**: 688-697

### ⚠️ Restrito Apenas para Admin (Não Aplicável para Manager)

#### 1. **POST /api/employees** (`employee.routes.js`)
- ⚠️ Apenas admin pode criar funcionários
- **Linha**: 92 (usa `admin` middleware)

#### 2. **DELETE /api/employees/:id** (`employee.routes.js`)
- ⚠️ Apenas admin pode deletar funcionários
- **Linha**: 182 (usa `admin` middleware)

#### 3. **PATCH /api/employees/:id/role** (`employee.routes.js`)
- ⚠️ Apenas admin pode alterar role
- **Linha**: 398 (usa `admin` middleware)

#### 4. **PATCH /api/employees/:id/overtime-limit** (`employee.routes.js`)
- ⚠️ Apenas admin pode alterar limite de horas extras
- **Linha**: 224 (usa `admin` middleware)

#### 5. **POST /api/employees/:id/overtime-exception** (`employee.routes.js`)
- ⚠️ Apenas admin pode adicionar exceções
- **Linha**: 273 (usa `admin` middleware)

#### 6. **DELETE /api/employees/:id/overtime-exception/:month/:year** (`employee.routes.js`)
- ⚠️ Apenas admin pode remover exceções
- **Linha**: 341 (usa `admin` middleware)

#### 7. **PATCH /api/employees/:id/work-schedule** (`employee.routes.js`)
- ⚠️ Apenas admin pode alterar jornada de trabalho
- **Linha**: 657 (usa `admin` middleware)

#### 8. **GET /api/audit/logs** (`audit.routes.js`)
- ⚠️ Apenas admin pode ver logs de auditoria
- **Linha**: 9 (usa `admin` middleware)

#### 9. **PUT /api/settings** (`settings.routes.js`)
- ⚠️ Apenas admin pode alterar configurações
- **Linha**: 151 (usa `admin` middleware)

### ✅ Funcionalidades Globais (Não Precisam de Filtro)

#### 1. **GET /api/justifications** (`justification.routes.js`)
- ✅ Justificativas são globais (não específicas de departamento)
- ✅ Manager pode ver todas as justificativas

#### 2. **POST /api/justifications** (`justification.routes.js`)
- ✅ Manager pode criar justificativas (globais)
- **Linha**: 25 (usa `adminOrManager` middleware)

#### 3. **PATCH /api/justifications/:id** (`justification.routes.js`)
- ✅ Manager pode atualizar justificativas (globais)
- **Linha**: 62 (usa `adminOrManager` middleware)

#### 4. **DELETE /api/justifications/:id** (`justification.routes.js`)
- ✅ Manager pode desativar justificativas (globais)
- **Linha**: 109 (usa `adminOrManager` middleware)

## Middleware de Validação

### `checkDepartmentAccess` (`middleware/departmentAccess.js`)
- ✅ Middleware criado mas **não está sendo usado** em todas as rotas
- ✅ Valida se manager está tentando acessar outro departamento
- **Status**: Disponível mas não aplicado globalmente

### `checkEmployeeDepartment` (`middleware/departmentAccess.js`)
- ✅ Função helper usada em algumas rotas
- ✅ Verifica se funcionário pertence ao departamento do manager
- **Uso**: `timeclock.routes.js` linha 652

## Recomendações

### 1. Aplicar Middleware Globalmente
Considerar aplicar `checkDepartmentAccess` como middleware em rotas que precisam de validação de departamento.

### 2. Rotas que Podem Precisar de Validação Adicional
- Verificar se há outras rotas que não foram listadas aqui
- Garantir que todas as rotas de edição validam departamento

### 3. Frontend
- ✅ Frontend já aplica filtros de departamento em `App.tsx`
- ✅ Componentes já respeitam role de manager

## Conclusão

**Status Geral**: ✅ **Bem Implementado**

A maioria das rotas já implementa filtros de departamento corretamente para managers. As rotas que não permitem acesso de manager são intencionalmente restritas apenas para admin (criação de funcionários, alteração de roles, configurações globais, etc.).

**Pontos Fortes**:
- Filtros de departamento aplicados em todas as rotas de leitura
- Validações de departamento em rotas de escrita/edição
- Middleware de validação disponível

**Pontos de Atenção**:
- Algumas rotas poderiam usar o middleware `checkDepartmentAccess` para consistência
- Documentação poderia ser melhorada

