using System.Runtime.InteropServices;
using HybridBiometricBridge;
using Microsoft.Extensions.Hosting.WindowsServices;

// ── Consola oculta para procesos en segundo plano ─────────────────────────────
// Cuando el proceso se lanza sin consola (wscript, Task Scheduler hidden, etc.)
// ConsoleLifetime de .NET falla porque no puede registrar los handlers de Ctrl+C.
// Solución: asignar una consola oculta si no hay ninguna y no es un Windows Service.
if (!WindowsServiceHelpers.IsWindowsService() && GetConsoleWindow() == IntPtr.Zero)
{
    AllocConsole();
    ShowWindow(GetConsoleWindow(), 0); // SW_HIDE: consola asignada pero invisible
}

var builder = Host.CreateApplicationBuilder(args);

// ── Fijar ContentRoot al directorio del ejecutable (independiente del CWD) ──
builder.Environment.ContentRootPath = AppContext.BaseDirectory;
builder.Configuration.SetBasePath(AppContext.BaseDirectory);

// ── Configuración ─────────────────────────────────────────────────────────
builder.Configuration
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);

// ── Servicios ─────────────────────────────────────────────────────────────
// Necesario para que el proceso se comunique correctamente con el SCM de Windows
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "HybridBiometricBridge";
});
builder.Services.AddHttpClient();
builder.Services.AddSingleton<FingerprintReader>();
builder.Services.AddSingleton<SourceAFISMatcher>();
builder.Services.AddSingleton<ApiClient>();
builder.Services.AddSingleton<LocalServer>();
builder.Services.AddHostedService<Worker>();

// ── Logging ───────────────────────────────────────────────────────────────
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
// Windows Event Log: visible en Visor de eventos cuando no hay consola
builder.Logging.AddEventLog(settings =>
{
    settings.SourceName = "HybridBiometricBridge";
    settings.LogName    = "Application";
});

var host = builder.Build();
host.Run();

// ── Win32 API para asignar consola oculta ─────────────────────────────────
[DllImport("kernel32.dll")] static extern bool AllocConsole();
[DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")]   static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
