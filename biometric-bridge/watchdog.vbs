Option Explicit

' ── Configuración ─────────────────────────────────────────────────────────────
Const BRIDGE_DIR    = "C:\HybridTraning\HibridWeb\biometric-bridge\publish"
Const BRIDGE_EXE    = "HybridBiometricBridge.exe"
Const BRIDGE_STATUS = "http://localhost:7072/status"
Const CHECK_EVERY   = 10000   ' ms entre cada comprobación (10 s)
Const RESTART_WAIT  = 25000   ' ms de espera tras reiniciar (deja inicializar DPFP)
Const MAX_NOT_READY = 6       ' intentos máximos con ready:false antes de reiniciar (6×10s = 60s)

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
Dim notReadyCount : notReadyCount = 0

Do While True
    Dim colProc : Set colProc = objWMI.ExecQuery( _
        "SELECT * FROM Win32_Process WHERE Name = '" & BRIDGE_EXE & "'")

    If colProc.Count = 0 Then
        ' Bridge no está corriendo — arrancarlo
        notReadyCount = 0
        WshShell.Run BRIDGE_EXE, 0, False
        ' Esperar a que inicialice antes de volver a revisar
        WScript.Sleep RESTART_WAIT
    ElseIf colProc.Count > 1 Then
        ' Más de una instancia — matar todas y dejar que el loop las reinicie
        notReadyCount = 0
        KillAllInstances()
        WScript.Sleep 5000
    Else
        ' Exactamente una instancia — verificar HTTP y estado del lector
        Dim response : response = BridgeResponse()

        If response = "" Then
            ' No responde por HTTP (HttpListener muerto, ej. tras hibernación)
            notReadyCount = 0
            KillAllInstances()
            WScript.Sleep 5000
        ElseIf InStr(response, """ready"":true") = 0 Then
            ' Responde HTTP pero lector no inicializado — contar intentos
            notReadyCount = notReadyCount + 1
            If notReadyCount >= MAX_NOT_READY Then
                ' Llevan 60 s con ready:false — reiniciar para limpiar el hilo STA
                notReadyCount = 0
                KillAllInstances()
                WScript.Sleep 5000
            Else
                WScript.Sleep CHECK_EVERY
            End If
        Else
            ' Todo bien — lector listo
            notReadyCount = 0
            WScript.Sleep CHECK_EVERY
        End If
    End If
Loop

' ── Función: obtener respuesta del bridge por HTTP ────────────────────────────
' Retorna el body JSON si responde 200, o "" si falla.
Function BridgeResponse()
    Dim objHTTP : Set objHTTP = CreateObject("WinHttp.WinHttpRequest.5.1")
    On Error Resume Next
    objHTTP.Open "GET", BRIDGE_STATUS, False
    objHTTP.SetTimeouts 2000, 2000, 2000, 2000
    objHTTP.Send
    If Err.Number = 0 And objHTTP.Status = 200 Then
        BridgeResponse = objHTTP.ResponseText
    Else
        BridgeResponse = ""
    End If
    On Error GoTo 0
End Function

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
