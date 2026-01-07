#!/bin/bash

echo "=== Backend: Commit e Push ==="
echo ""

# Verificar branch atual
BRANCH=$(git branch --show-current)
echo "Branch atual: $BRANCH"
echo ""

# Adicionar todos os arquivos
echo "1. Adicionando arquivos..."
git add .

# Verificar status
echo ""
echo "2. Status dos arquivos:"
git status --short

# Fazer commit
echo ""
echo "3. Fazendo commit..."
git commit -m "feat: adiciona role manager, justificativas e filtros por departamento

- Adiciona role 'manager' ao enum UserRole
- Cria rotas de justificativas (CRUD)
- Adiciona filtros por departamento para manager
- Cria job diário para registros automáticos com horas negativas
- Adiciona middleware de validação por departamento (departmentAccess)
- Atualiza rotas de employees, overtime e hourBank com suporte a manager
- Adiciona middleware adminOrManager para validação de acesso"

# Fazer push
echo ""
echo "4. Fazendo push para $BRANCH..."
git push origin $BRANCH

echo ""
echo "=== Backend: Concluído! ==="

