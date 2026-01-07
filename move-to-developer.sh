#!/bin/bash

echo "=== Movendo mudanças para branch developer ==="
echo ""

# 1. Fazer stash dos arquivos modificados
echo "1. Fazendo stash dos arquivos modificados..."
git stash push -m "Mudanças para developer: manager role, timeclock, justificativas" prisma/schema.prisma src/routes/employee.routes.js src/routes/hourBank.routes.js src/server.js src/middleware/auth.js

# 2. Mover arquivos não rastreados temporariamente
echo ""
echo "2. Movendo arquivos não rastreados temporariamente..."
mkdir -p .temp-files
mv src/routes/justification.routes.js .temp-files/ 2>/dev/null || true
mv src/routes/timeclock.routes.js .temp-files/ 2>/dev/null || true
mv src/middleware/departmentAccess.js .temp-files/ 2>/dev/null || true
mv src/jobs/dailyTimeClockJob.js .temp-files/ 2>/dev/null || true

# 3. Fazer checkout para developer
echo ""
echo "3. Fazendo checkout para branch developer..."
git checkout developer

# 4. Aplicar stash
echo ""
echo "4. Aplicando mudanças do stash..."
git stash pop

# 5. Restaurar arquivos não rastreados
echo ""
echo "5. Restaurando arquivos novos..."
cp .temp-files/justification.routes.js src/routes/ 2>/dev/null || true
cp .temp-files/timeclock.routes.js src/routes/ 2>/dev/null || true
cp .temp-files/departmentAccess.js src/middleware/ 2>/dev/null || true
cp .temp-files/dailyTimeClockJob.js src/jobs/ 2>/dev/null || true

# 6. Limpar arquivos temporários
echo ""
echo "6. Limpando arquivos temporários..."
rm -rf .temp-files

# 7. Verificar status
echo ""
echo "7. Status final:"
git status

echo ""
echo "=== Concluído! ==="
echo "Verifique se há conflitos e resolva se necessário."

