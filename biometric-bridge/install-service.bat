@echo off
:: ============================================================
:: Hybrid Biometric Bridge — Instalador de Windows Service
:: Ejecutar como Administrador
:: ============================================================

set SERVICE_NAME=HybridBiometricBridge
set EXE_PATH=%~dp0HybridBiometricBridge.exe

echo.
echo  === Hybrid Biometric Bridge - Instalador ===
echo.

:: Verificar que el .exe exista
if not exist "%EXE_PATH%" (
    echo [ERROR] No se encontro el ejecutable: %EXE_PATH%
    echo         Primero compila el proyecto con: dotnet publish
    pause
    exit /b 1
)

:: Detener e eliminar si ya existe
sc query "%SERVICE_NAME%" >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [INFO] Servicio ya existe, deteniendo...
    sc stop "%SERVICE_NAME%" >nul 2>&1
    timeout /t 3 /nobreak >nul
    sc delete "%SERVICE_NAME%" >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: Crear el servicio
echo [INFO] Instalando servicio...
sc create "%SERVICE_NAME%" binPath= "\"%EXE_PATH%\"" start= auto DisplayName= "Hybrid Biometric Bridge"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] No se pudo instalar. Ejecuta como Administrador.
    pause
    exit /b 1
)

:: Descripcion del servicio
sc description "%SERVICE_NAME%" "Puente entre el lector de huellas Digital Persona y la plataforma Hybrid Training."

:: Configurar reinicio automatico en caso de fallo
sc failure "%SERVICE_NAME%" reset= 60 actions= restart/5000/restart/5000/restart/10000

:: Iniciar el servicio
echo [INFO] Iniciando servicio...
sc start "%SERVICE_NAME%"

timeout /t 3 /nobreak >nul
sc query "%SERVICE_NAME%" | find "RUNNING" >nul
if %ERRORLEVEL% == 0 (
    echo.
    echo [OK] Servicio instalado y corriendo correctamente.
    echo      Se iniciara automaticamente con Windows.
) else (
    echo.
    echo [WARN] Servicio instalado pero no inicio. Revisa el lector USB.
)

echo.
pause
