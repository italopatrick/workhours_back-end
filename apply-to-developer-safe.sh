#!/bin/bash

echo "=== Aplicando mudanças na branch developer ==="
echo ""

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
    echo "Erro: Execute este script no diretório raiz do projeto"
    exit 1
fi

# 1. Verificar se há mudanças não commitadas
if [ -n "$(git status --porcelain)" ]; then
    echo "1. Salvando mudanças atuais..."
    
    # Fazer stash de todos os arquivos modificados
    git stash push -m "Mudanças temporárias antes de mudar para developer" -u
    
    echo "   ✓ Mudanças salvas no stash"
else
    echo "1. Nenhuma mudança pendente"
fi

# 2. Verificar se existe timeClock.routes.js na developer (com C maiúsculo)
echo ""
echo "2. Verificando arquivos na branch developer..."
git fetch origin developer 2>/dev/null || true

# Verificar se timeClock.routes.js existe na developer
if git ls-tree -r --name-only origin/developer 2>/dev/null | grep -q "timeClock.routes.js"; then
    echo "   ⚠ Arquivo timeClock.routes.js existe na developer"
    echo "   Será necessário renomear ou remover após checkout"
fi

# 3. Fazer checkout para developer
echo ""
echo "3. Fazendo checkout para branch developer..."
if git checkout developer 2>&1 | grep -q "error"; then
    echo "   ⚠ Erro ao fazer checkout. Tentando forçar..."
    
    # Se falhar, tentar com --force (cuidado!)
    # Mas primeiro, vamos tentar uma abordagem mais segura
    echo ""
    echo "   Tentando abordagem alternativa..."
    
    # Salvar arquivos novos em local temporário
    mkdir -p ../temp-backend-files
    cp -r src/routes/justification.routes.js ../temp-backend-files/ 2>/dev/null || true
    cp -r src/routes/timeclock.routes.js ../temp-backend-files/ 2>/dev/null || true
    cp -r src/middleware/departmentAccess.js ../temp-backend-files/ 2>/dev/null || true
    cp -r src/jobs/dailyTimeClockJob.js ../temp-backend-files/ 2>/dev/null || true
    
    # Remover arquivos que estão causando conflito
    rm -f src/routes/justification.routes.js
    rm -f src/routes/timeclock.routes.js
    rm -f src/routes/timeClock.routes.js 2>/dev/null || true
    
    # Tentar checkout novamente
    git checkout developer
    
    # Restaurar arquivos
    cp ../temp-backend-files/justification.routes.js src/routes/ 2>/dev/null || true
    cp ../temp-backend-files/timeclock.routes.js src/routes/ 2>/dev/null || true
    cp ../temp-backend-files/departmentAccess.js src/middleware/ 2>/dev/null || true
    cp ../temp-backend-files/dailyTimeClockJob.js src/jobs/ 2>/dev/null || true
    
    rm -rf ../temp-backend-files
else
    echo "   ✓ Checkout realizado com sucesso"
fi

# 4. Aplicar stash se houver
echo ""
echo "4. Aplicando mudanças do stash..."
if git stash list | grep -q "Mudanças temporárias"; then
    git stash pop
    echo "   ✓ Mudanças aplicadas"
else
    echo "   ℹ Nenhum stash para aplicar"
fi

# 5. Verificar se timeClock.routes.js existe e precisa ser removido
if [ -f "src/routes/timeClock.routes.js" ] && [ -f "src/routes/timeclock.routes.js" ]; then
    echo ""
    echo "5. Removendo arquivo duplicado timeClock.routes.js..."
    rm -f src/routes/timeClock.routes.js
    echo "   ✓ Arquivo duplicado removido"
fi

# 6. Status final
echo ""
echo "6. Status final:"
git status

echo ""
echo "=== Processo concluído! ==="
echo ""
echo "Próximos passos:"
echo "1. Verifique se há conflitos (git status)"
echo "2. Se houver conflitos, resolva manualmente"
echo "3. Adicione os arquivos novos: git add src/routes/justification.routes.js src/routes/timeclock.routes.js src/middleware/departmentAccess.js src/jobs/dailyTimeClockJob.js"
echo "4. Faça commit das mudanças"

