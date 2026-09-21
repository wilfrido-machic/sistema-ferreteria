@echo off
cd /d "%~dp0frontend"
if not exist node_modules call npm install
echo.
echo Abriendo http://127.0.0.1:5173/
echo No cierres esta ventana mientras uses el sistema.
echo.
start "" "http://127.0.0.1:5173/"
call npm run dev
