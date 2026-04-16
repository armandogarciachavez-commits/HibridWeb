using System.Net;
using System.Text;
using System.Text.Json;

namespace HybridBiometricBridge;

public sealed class LocalServer : IDisposable
{
    private readonly HttpListener            _listener = new();
    private readonly FingerprintReader       _reader;
    private readonly SourceAFISMatcher       _matcher;
    private readonly ApiClient               _api;
    private readonly ILogger<LocalServer>    _log;
    private readonly CancellationTokenSource _cts = new();
    private readonly SemaphoreSlim           _captureLock = new(1, 1);

    private Task? _loop;
    private Task? _scanLoop;
    private DateTime _lastCacheReload = DateTime.MinValue;
    private static readonly TimeSpan CacheRefreshInterval = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan CacheRetryInterval   = TimeSpan.FromSeconds(30);
    public bool Capturing => _captureLock.CurrentCount == 0;

    public LocalServer(FingerprintReader reader, SourceAFISMatcher matcher,
                       ApiClient api, IConfiguration cfg, ILogger<LocalServer> log)
    {
        _reader  = reader;
        _matcher = matcher;
        _api     = api;
        _log     = log;

        int port = cfg.GetValue<int>("Bridge:LocalPort", 7072);
        _listener.Prefixes.Add($"http://localhost:{port}/");
    }

    public void Start()
    {
        _listener.Start();
        _log.LogInformation("Servidor local iniciado en {P}", _listener.Prefixes.First());
        _loop     = Task.Run(ListenLoop);
        _scanLoop = Task.Run(() => ScanLoop(_cts.Token));
    }

    // ── Scan loop continuo ────────────────────────────────────────────────
    private async Task ScanLoop(CancellationToken ct)
    {
        _log.LogInformation("Modo escaneo continuo iniciado.");
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!_reader.IsReady)
                {
                    _log.LogWarning("Lector no disponible. Intentando reinicializar...");
                    bool ok = _reader.Initialize();
                    if (!ok)
                    {
                        _log.LogWarning("Reinicialización fallida. Reintentando en 5 s...");
                        await Task.Delay(5_000, ct);
                    }
                    continue;
                }

                await _captureLock.WaitAsync(ct);
                byte[]? probePng = null;
                try
                {
                    using var scanCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    scanCts.CancelAfter(TimeSpan.FromSeconds(10));
                    probePng = await _reader.CaptureImageAsync(scanCts.Token);
                }
                finally { _captureLock.Release(); }

                if (probePng == null) continue;

                // Recargar templates si el cache está vacío (respetando intervalo de reintento)
                // o si ha pasado el intervalo normal de refresco
                bool cacheEmpty = _matcher.CacheSize == 0
                    && (DateTime.UtcNow - _lastCacheReload) >= CacheRetryInterval;
                bool cacheStale = (DateTime.UtcNow - _lastCacheReload) >= CacheRefreshInterval;
                if (cacheEmpty || cacheStale)
                {
                    var templates = await _api.GetTemplatesAsync();
                    _matcher.ReloadCache(templates);
                    _lastCacheReload = DateTime.UtcNow;
                    _log.LogInformation("Cache recargado: {N} templates.", _matcher.CacheSize);
                }

                var matchedId = _matcher.Match(probePng, _log);

                if (matchedId.HasValue)
                {
                    _log.LogInformation("Socio identificado: user_id={Id}", matchedId.Value);
                    var (ok, msg) = await _api.VerifyAsync(matchedId.Value);
                    _log.LogInformation("Acceso: {S} — {M}", ok ? "GRANTED" : "DENIED", msg);
                    await Task.Delay(3_000, ct);
                }
                else
                {
                    // Sin match: si quedan usuarios recientes sin cargar, forzar recarga inmediata
                    if ((DateTime.UtcNow - _lastCacheReload) >= TimeSpan.FromSeconds(30))
                    {
                        var templates = await _api.GetTemplatesAsync();
                        _matcher.ReloadCache(templates);
                        _lastCacheReload = DateTime.UtcNow;
                    }
                    await Task.Delay(1_000, ct);
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _log.LogError(ex, "Error en scan loop");
                await Task.Delay(2_000, ct);
            }
        }
    }

    // ── HTTP loop ─────────────────────────────────────────────────────────
    private async Task ListenLoop()
    {
        while (!_cts.Token.IsCancellationRequested)
        {
            try
            {
                var ctx = await _listener.GetContextAsync();
                _ = Task.Run(() => HandleRequest(ctx));
            }
            catch (ObjectDisposedException) { break; }
            catch (Exception ex) { _log.LogError(ex, "Error en loop HTTP"); }
        }
    }

    private async Task HandleRequest(HttpListenerContext ctx)
    {
        var req = ctx.Request;
        var res = ctx.Response;

        res.Headers.Add("Access-Control-Allow-Origin",  "*");
        res.Headers.Add("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.Headers.Add("Access-Control-Allow-Headers", "Content-Type,Authorization");
        res.ContentType = "application/json; charset=utf-8";

        if (req.HttpMethod == "OPTIONS") { res.StatusCode = 204; res.Close(); return; }

        string path = req.Url?.AbsolutePath.ToLower() ?? "/";

        try
        {
            if (path == "/status" && req.HttpMethod == "GET")
                await WriteJson(res, new { ready = _reader.IsReady, capturing = Capturing });

            else if (path == "/enroll" && req.HttpMethod == "POST")
                await HandleEnroll(req, res);

            else if (path == "/scan" && req.HttpMethod == "POST")
                await HandleScan(res);

            else if (path == "/abort" && req.HttpMethod == "POST")
            {
                _reader.AbortCapture();
                await WriteJson(res, new { ok = true, msg = "Captura cancelada." });
            }
            else
                await WriteJson(res, new { msg = "Ruta no encontrada." }, 404);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error procesando {P}", path);
            await WriteJson(res, new { ok = false, msg = ex.Message }, 500);
        }
    }

    // ── Enrolamiento (1 captura = 1 template SourceAFIS) ─────────────────
    private async Task HandleEnroll(HttpListenerRequest req, HttpListenerResponse res)
    {
        using var sr = new StreamReader(req.InputStream);
        var body   = JsonSerializer.Deserialize<JsonElement>(await sr.ReadToEndAsync());
        int userId = body.GetProperty("user_id").GetInt32();

        _reader.AbortCapture();

        if (!await _captureLock.WaitAsync(3_000))
        {
            await WriteJson(res, new { ok = false, msg = "Ya hay una captura en curso." }, 409);
            return;
        }

        try
        {
            _log.LogInformation("Capturando huella para user_id={Id}...", userId);

            using var enrollCts = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token);
            enrollCts.CancelAfter(TimeSpan.FromSeconds(20));

            var png = await _reader.CaptureImageAsync(enrollCts.Token);
            if (png == null)
            {
                await WriteJson(res, new { ok = false, msg = "No se pudo capturar la muestra." }, 422);
                return;
            }

            // Serializa el template SourceAFIS (1-5KB) en lugar del PNG crudo (~200KB)
            var templateBase64 = SourceAFISMatcher.BuildAndSerialize(png);
            _log.LogInformation("Template serializado: {KB}KB", templateBase64.Length / 1024);
            var (ok, msg) = await _api.EnrollAsync(userId, templateBase64);

            if (ok)
            {
                // Actualizar cache inmediatamente
                _matcher.AddToCache(userId, templateBase64);
                _log.LogInformation("Huella enrolada para user_id={Id}.", userId);
            }

            await WriteJson(res,
                new { ok, msg = ok ? "Huella enrolada correctamente." : msg, status = "complete" },
                ok ? 200 : 500);
        }
        finally { _captureLock.Release(); }
    }

    // ── Scan manual ───────────────────────────────────────────────────────
    private async Task HandleScan(HttpListenerResponse res)
    {
        if (!await _captureLock.WaitAsync(0))
        {
            await WriteJson(res, new { ok = false, msg = "Ya hay una captura en curso." }, 409);
            return;
        }

        try
        {
            using var scanCts = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token);
            scanCts.CancelAfter(TimeSpan.FromSeconds(15));

            var png = await _reader.CaptureImageAsync(scanCts.Token);
            if (png == null)
            {
                await WriteJson(res, new { ok = false, msg = "No se pudo leer la huella." }, 422);
                return;
            }

            bool stale = (DateTime.UtcNow - _lastCacheReload) >= CacheRefreshInterval;
            if (_matcher.CacheSize == 0 || stale)
            {
                var templates = await _api.GetTemplatesAsync();
                _matcher.ReloadCache(templates);
                _lastCacheReload = DateTime.UtcNow;
            }

            var uid = _matcher.Match(png, _log);
            if (uid.HasValue)
            {
                var (ok, msg) = await _api.VerifyAsync(uid.Value);
                await WriteJson(res, new { ok, msg }, ok ? 200 : 403);
            }
            else
            {
                await WriteJson(res, new { ok = false, msg = "Huella no reconocida." }, 404);
            }
        }
        finally { _captureLock.Release(); }
    }

    static async Task WriteJson(HttpListenerResponse res, object obj, int status = 200)
    {
        res.StatusCode = status;
        byte[] buf = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(obj));
        res.ContentLength64 = buf.Length;
        await res.OutputStream.WriteAsync(buf);
        res.OutputStream.Close();
    }

    public void Dispose()
    {
        _cts.Cancel();
        if (_listener?.IsListening == true)
            _listener.Stop();
        _listener.Close();
    }
}
