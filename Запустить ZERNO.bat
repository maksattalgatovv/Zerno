@echo off
chcp 65001 >nul
title ZERNO
echo Запускаю ZERNO. Не закрывайте открывшиеся окна, пока работаете с сайтом.

curl -s -o nul http://localhost:8000/api/health
if errorlevel 1 start "ZERNO сервер" /d "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"

curl -s -o nul http://localhost:3000
if errorlevel 1 (
  if not exist "%~dp0frontend\.next\BUILD_ID" (
    echo Первая сборка, это займёт около минуты...
    pushd "%~dp0frontend"
    call npm run build
    popd
  )
  start "ZERNO сайт" /d "%~dp0frontend" cmd /k "npx next start -H 0.0.0.0 -p 3000"
)

echo Жду, пока сайт будет готов...
:wait
timeout /t 2 /nobreak >nul
curl -s -o nul http://localhost:3000
if errorlevel 1 goto wait

start "" http://localhost:3000

echo.
echo Сайт открыт на этом компьютере: http://localhost:3000
echo На телефоне в той же сети Wi-Fi откройте один из этих адресов:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=* delims= " %%b in ("%%a") do echo   http://%%b:3000
echo.
pause
