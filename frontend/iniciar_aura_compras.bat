@echo off
title AURA Compras - Servidor Web Corporativo
cls
echo ================================================================
echo           AURA COMPRAS - SISTEMA CORPORATIVO v2.0
echo       Fidelidad Oficial al Prototipo de Figma (Dark Mode)
echo ================================================================
echo.
cd /d "%~dp0"
echo [*] Limpiando instancias previas en el puerto 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo [*] Verificando dependencias...
if not exist node_modules call npm install
echo [*] Abriendo navegador en http://localhost:3000 ...
start http://localhost:3000
echo [*] Servidor AURA Compras activo (Presiona Ctrl+C para detener)
node server.js
