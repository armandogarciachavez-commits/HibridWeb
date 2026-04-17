namespace HybridBiometricBridge;

/// <summary>
/// Worker principal del Windows Service.
/// Inicializa el lector y el servidor local,
/// luego se mantiene vivo hasta que el servicio se detenga.
/// </summary>
public sealed class Worker : BackgroundService
{
    private readonly FingerprintReader _reader;
    private readonly LocalServer       _server;
    private readonly ILogger<Worker>   _log;

    public Worker(FingerprintReader reader, LocalServer server, ILogger<Worker> log)
    {
        _reader = reader;
        _server = server;
        _log    = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("=== Hybrid Biometric Bridge iniciando ===");

        // Esperar a que el driver DPFP esté listo (especialmente en arranque al logon)
        _log.LogInformation("Esperando 15 s para que el driver DPFP esté listo...");
        await Task.Delay(15_000, stoppingToken);

        // Intentar inicializar el lector (reintenta cada 5 s si falla)
        while (!stoppingToken.IsCancellationRequested && !_reader.IsReady)
        {
            bool ok = _reader.Initialize();
            if (ok)
            {
                _log.LogInformation("Lector USB detectado y listo.");
                break;
            }
            _log.LogWarning("Lector no disponible. Reintentando en 5 s...");
            await Task.Delay(5_000, stoppingToken);
        }

        // Inicia el servidor HTTP local
        _server.Start();
        _log.LogInformation("Bridge listo. Esperando peticiones.");

        // Mantener el servicio vivo
        await Task.Delay(Timeout.Infinite, stoppingToken);

        _log.LogInformation("Bridge detenido.");
    }

    public override void Dispose()
    {
        _server.Dispose();
        _reader.Dispose();
        base.Dispose();
    }
}
