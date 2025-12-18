@echo off
echo 1. Fazendo stash das mudancas atuais...
git stash push -m "Mudancas para aplicar na developer: manager role, timeclock, justificativas"

echo 2. Fazendo checkout para developer...
git checkout developer

echo 3. Aplicando mudancas...
git stash pop

echo 4. Verificando status...
git status

echo Concluido! As mudancas foram aplicadas na branch developer.
pause

