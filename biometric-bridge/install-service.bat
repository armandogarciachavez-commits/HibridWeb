@echo off
:: ============================================================
:: Hybrid Biometric Bridge — Instalador via Task Scheduler
:: Ejecutar como Administrador
:: Corre en la sesion del usuario (necesario para acceso USB)
:: ============================================================

set TASK_NAME=HybridBiometricBridge
set EXE_PATH=%~dp0bin\Release\net8.0-windows\win-x64\publish\HybridBiometricBridge.exe

echo.
echo  === Hybrid Biometric Bridge - Instalador ===
echo.

:: Verificar que el .exe exista
if not exist "%EXE_PATH%" (
    echo [ERROR] No se encontro el ejecutable: %EXE_PATH%
    echo         Primero compila el proyecto con: dotnet publish -c Release -r win-x64 --self-contained
    pause
    exit /b 1
)

:: Eliminar tarea anterior si existe
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Crear tarea que inicia al logon del usuario actual en sesion interactiva
schtasks /create /tn "%TASK_NAME%" ^
  /tr "\"%EXE_PATH%\"" ^
  /sc onlogon ^
  /rl highest ^
  /f

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] No se pudo crear la tarea. Ejecuta como Administrador.
    pause
    exit /b 1
)

echo [INFO] Iniciando bridge ahora...
start "" "%EXE_PATH%"

echo.
echo [OK] Hybrid Biometric Bridge instalado correctamente.
echo      Iniciara automaticamente cada vez que inicies sesion en Windows.
echo      Escuchando en http://localhost:7072
echo.
pause
