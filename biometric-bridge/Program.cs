using HybridBiometricBridge;

var builder = Host.CreateApplicationBuilder(args);

// ── Windows Service ───────────────────────────────────────────────────────
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "HybridBiometricBridge";
});

// ── Configuración ─────────────────────────────────────────────────────────
builder.Configuration
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);

// ── Servicios ─────────────────────────────────────────────────────────────
builder.Services.AddHttpClient();
builder.Services.AddSingleton<FingerprintReader>();
builder.Services.AddSingleton<ApiClient>();
builder.Services.AddSingleton<LocalServer>();
builder.Services.AddHostedService<Worker>();

// ── Logging a archivo (para diagnóstico como servicio) ────────────────────
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddEventLog(settings =>
{
    settings.SourceName = "HybridBiometricBridge";
});

var host = builder.Build();
host.Run();
