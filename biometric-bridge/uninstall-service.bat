@echo off
:: Ejecutar como Administrador
set SERVICE_NAME=HybridBiometricBridge

echo [INFO] Deteniendo y eliminando servicio %SERVICE_NAME%...
sc stop "%SERVICE_NAME%" >nul 2>&1
timeout /t 3 /nobreak >nul
sc delete "%SERVICE_NAME%"

echo [OK] Servicio eliminado.
pause
