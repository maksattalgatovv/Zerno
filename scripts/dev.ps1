# Starts the ZERNO backend and frontend in their own windows.
$root = Split-Path $PSScriptRoot -Parent

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; .\.venv\Scripts\python -m uvicorn app.main:app --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Output "Frontend: http://localhost:3000"
Write-Output "API docs: http://localhost:8000/docs"
