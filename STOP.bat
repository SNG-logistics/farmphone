@echo off
title AUTOMATION CONTROL — STOP ALL SERVICES
chcp 65001 > nul
cls

echo ======================================================
echo   🛑 AUTOMATION CONTROL — STOPPING ALL SERVICES
echo ======================================================
echo.

powershell -Command "Get-NetTCPConnection -LocalPort 3001,3000 -ErrorAction SilentlyContinue | ForEach-Object { if ($_.OwningProcess -gt 0) { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
taskkill /F /IM node.exe > nul 2>&1

echo ✅ All system services stopped and ports cleared successfully.
echo.
pause
