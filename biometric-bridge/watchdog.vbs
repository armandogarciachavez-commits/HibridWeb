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

' ── Matar TODAS las instancias existentes al arrancar ────────────────────────
' Evita el problema de instancias dobles si el watchdog se relanza
KillAllInstances()
WScript.Sleep 3000   ' Dar tiempo a que los procesos mueran completamente

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
    ElseIf colProc.Count > 1 Then
        ' Más de una instancia — matar todas y dejar que el loop las reinicie
        KillAllInstances()
        WScript.Sleep 5000
    Else
        ' Exactamente una instancia corriendo — todo bien
        WScript.Sleep CHECK_EVERY
    End If
Loop

' ── Función: terminar todas las instancias del bridge ─────────────────────────
Sub KillAllInstances()
    Dim colKill : Set colKill = objWMI.ExecQuery( _
        "SELECT * FROM Win32_Process WHERE Name = '" & BRIDGE_EXE & "'")
    Dim proc
    For Each proc In colKill
        On Error Resume Next
        proc.Terminate()
        On Error GoTo 0
    Next
End Sub
