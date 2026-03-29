using System.Windows.Forms;

namespace HybridBiometricBridge;

/// <summary>
/// Worker principal del Windows Service.
/// Inicia un hilo STA con message pump (requerido por el SDK DigitalPersona),
/// inicializa el lector y el servidor local.
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

        // El SDK DigitalPersona necesita un message pump STA para recibir
        // eventos USB del lector. Lo iniciamos en un hilo dedicado.
        var pumpReady = new TaskCompletionSource();
        var staThread = new Thread(() =>
        {
            Application.Idle += (_, _) => pumpReady.TrySetResult();
            Application.Run();
        });
        staThread.SetApartmentState(ApartmentState.STA);
        staThread.IsBackground = true;
        staThread.Start();

        // Esperar a que el message pump esté activo (máx. 3 s)
        await Task.WhenAny(pumpReady.Task, Task.Delay(3_000, stoppingToken));
        _log.LogInformation("Message pump STA iniciado.");

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
        Application.ExitThread();
    }

    public override void Dispose()
    {
        _server.Dispose();
        _reader.Dispose();
        base.Dispose();
    }
}
