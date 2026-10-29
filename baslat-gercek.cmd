@echo off
rem Gerçek veri örneği: üretim modu, demo hesaplar kapalı, veri D:\neademy-veri içinde, anahtar proje dışında
set NEADEMY_ORTAM=uretim
set DATA_DIR=D:\neademy-veri
set PORT=3001
set /p GIZLI_ANAHTAR=<C:\Users\PC\neademy-gizli-anahtar.txt
cd /d "%~dp0"
node --no-warnings server.js
