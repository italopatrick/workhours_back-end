#!/bin/bash

# Script para aplicar mudanças na branch developer

echo "1. Fazendo stash das mudanças atuais..."
git stash push -m "Mudanças para aplicar na developer: manager role, timeclock, justificativas"

echo "2. Fazendo checkout para developer..."
git checkout developer

echo "3. Aplicando mudanças..."
git stash pop

echo "4. Verificando status..."
git status

echo "Concluído! As mudanças foram aplicadas na branch developer."

