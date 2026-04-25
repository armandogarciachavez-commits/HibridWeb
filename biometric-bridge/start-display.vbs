Option Explicit

' ── start-display.vbs ─────────────────────────────────────────────────────────
' Abre la pantalla del scanner en modo kiosko al iniciar sesión.
' Se ejecuta junto con watchdog.vbs vía Task Scheduler.
'
' REQUISITO: el watchdog.vbs debe ejecutarse ANTES para que el bridge esté listo.
' Este script espera 30 segundos para darle tiempo al bridge de arrancar.
' ──────────────────────────────────────────────────────────────────────────────

Const BRIDGE_URL    = "http://localhost:7072/display"
Const STARTUP_WAIT  = 30000   ' ms — espera al bridge antes de abrir el browser
Const MAX_WAIT      = 20      ' intentos de verificar que el bridge responde
Const CHECK_DELAY   = 1500    ' ms entre cada intento

Dim WshShell : Set WshShell = CreateObject("WScript.Shell")
Dim objHTTP  : Set objHTTP  = CreateObject("WinHttp.WinHttpRequest.5.1")

' Espera inicial para que el bridge arranque
WScript.Sleep STARTUP_WAIT

' Verifica que el bridge esté respondiendo antes de abrir el browser
Dim i, bridgeReady
bridgeReady = False
For i = 1 To MAX_WAIT
    On Error Resume Next
    objHTTP.Open "GET", "http://localhost:7072/status", False
    objHTTP.SetTimeouts 1000, 1000, 1000, 1000
    objHTTP.Send
    If Err.Number = 0 And objHTTP.Status = 200 Then
        bridgeReady = True
        Exit For
    End If
    On Error GoTo 0
    WScript.Sleep CHECK_DELAY
Next

' Abrir Edge en modo kiosco (pantalla completa sin barra de navegación)
' Si Edge no está disponible, abrir Chrome. Si tampoco, abrir en el browser por defecto.
Dim edgePath, chromePath
edgePath   = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

Dim browserCmd
If CreateObject("Scripting.FileSystemObject").FileExists(edgePath) Then
    ' Edge app mode: pantalla completa pero minimizable desde la barra de tareas
    browserCmd = """" & edgePath & """ --app=" & BRIDGE_URL & " --start-fullscreen --no-first-run --disable-translate --disable-infobars"
ElseIf CreateObject("Scripting.FileSystemObject").FileExists(chromePath) Then
    ' Chrome app mode
    browserCmd = """" & chromePath & """ --app=" & BRIDGE_URL & " --start-fullscreen --disable-infobars --no-first-run"
Else
    ' Fallback: abrir con el browser por defecto
    browserCmd = "explorer.exe """ & BRIDGE_URL & """"
End If

WshShell.Run browserCmd, 0, False
