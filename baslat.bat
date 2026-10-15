@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Akant platformu baslatiliyor...
echo Tarayicida acin: http://localhost:3000
echo Durdurmak icin bu pencerede Ctrl+C
start "" http://localhost:3000
node --no-warnings server.js
pause
