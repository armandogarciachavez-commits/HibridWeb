@echo off
set TASK_NAME=HybridBiometricBridge

echo.
echo  === Hybrid Biometric Bridge - Desinstalador ===
echo.

taskkill /im HybridBiometricBridge.exe /f >/dev/null 2>&1
schtasks /delete /tn "%TASK_NAME%" /f >/dev/null 2>&1

echo [OK] Bridge desinstalado correctamente.
echo.
pause
