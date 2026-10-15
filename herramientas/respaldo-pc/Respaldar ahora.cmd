@echo off
rem GH Manager - hacer un respaldo ahora mismo
echo Respaldando...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0respaldo.ps1"
powershell.exe -NoProfile -Command "Get-Content -LiteralPath '%~dp0registro.txt' -Tail 1"
echo.
pause
