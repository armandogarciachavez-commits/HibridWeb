Option Explicit

' ── Configuración ─────────────────────────────────────────────────────────────
Const BRIDGE_DIR  = "C:\HybridTraning\HibridWeb\biometric-bridge\publish"
Const BRIDGE_EXE  = "HybridBiometricBridge.exe"
Const CHECK_EVERY = 10000   ' ms entre cada comprobación (10 s)
Const RESTART_WAIT = 25000  ' ms de espera tras reiniciar (deja inicializar DPFP)

' ── Objetos ───────────────────────────────────────────────────────────────────
Dim WshShell : Set WshShell = CreateObject("WScript.Shell")
Dim objWMI   : Set objWMI   = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\cimv2")

WshShell.CurrentDirectory = BRIDGE_DIR

' Pausa inicial: deja que el sistema arranque y el driver DPFP esté listo
WScript.Sleep 15000

' ── Bucle principal ───────────────────────────────────────────────────────────
Do While True
    Dim colProc : Set colProc = objWMI.ExecQuery( _
        "SELECT * FROM Win32_Process WHERE Name = '" & BRIDGE_EXE & "'")

    If colProc.Count = 0 Then
        ' Bridge no está corriendo — arrancarlo
        WshShell.Run BRIDGE_EXE, 0, False
        ' Esperar a que inicialice antes de volver a revisar
        WScript.Sleep RESTART_WAIT
    Else
        ' Bridge corriendo — revisar de nuevo en 10 s
        WScript.Sleep CHECK_EVERY
    End If
Loop
