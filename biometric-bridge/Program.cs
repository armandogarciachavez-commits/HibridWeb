using HybridBiometricBridge;

var builder = Host.CreateApplicationBuilder(args);

// ── Configuración ─────────────────────────────────────────────────────────
builder.Configuration
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);

// ── Servicios ─────────────────────────────────────────────────────────────
builder.Services.AddHttpClient();
builder.Services.AddSingleton<FingerprintReader>();
builder.Services.AddSingleton<SourceAFISMatcher>();
builder.Services.AddSingleton<ApiClient>();
builder.Services.AddSingleton<LocalServer>();
builder.Services.AddHostedService<Worker>();

// ── Logging ───────────────────────────────────────────────────────────────
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
// Windows Event Log: permite ver errores en el Visor de eventos cuando corre como servicio
builder.Logging.AddEventLog(settings =>
{
    settings.SourceName = "HybridBiometricBridge";
    settings.LogName    = "Application";
});

var host = builder.Build();
host.Run();
