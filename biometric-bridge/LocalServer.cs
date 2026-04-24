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
    private readonly LocalCache              _cache;
    private readonly ILogger<LocalServer>    _log;
    private readonly CancellationTokenSource _cts = new();
    private readonly SemaphoreSlim           _captureLock = new(1, 1);

    private Task? _loop;
    private Task? _scanLoop;
    private Task? _syncLoop;
    private DateTime _lastCacheReload = DateTime.MinValue;
    private static readonly TimeSpan CacheRefreshInterval = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan CacheRetryInterval   = TimeSpan.FromSeconds(30);
    public bool Capturing => _captureLock.CurrentCount == 0;

    // Último scan en memoria para el endpoint /recent-scan
    private readonly object _lastScanLock = new();
    private string?  _lastScanJson;
    private DateTime _lastScanAt = DateTime.MinValue;

    private static long _scanIdCounter = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    public LocalServer(FingerprintReader reader, SourceAFISMatcher matcher,
                       ApiClient api, LocalCache cache, IConfiguration cfg,
                       ILogger<LocalServer> log)
    {
        _reader  = reader;
        _matcher = matcher;
        _api     = api;
        _cache   = cache;
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
        _syncLoop = Task.Run(() => SyncLoop(_cts.Token));

        // ── Arranque offline-first ────────────────────────────────────────────
        // 1. Cargar del disco INMEDIATAMENTE (sin internet) → el scanner funciona al instante
        // 2. Refrescar desde la API en segundo plano → actualiza si hay internet
        var diskTemplates = _cache.LoadTemplates();
        if (diskTemplates.Count > 0)
        {
            _matcher.ReloadCache(diskTemplates);
            _lastCacheReload = DateTime.UtcNow;
            _log.LogInformation("Templates del disco cargados al inicio: {N}.", diskTemplates.Count);
        }
        _cache.LoadMembers();
        _log.LogInformation("Socios del disco cargados al inicio: {N}.", _cache.MemberCount);

        // Refresco desde API en background (no bloquea el scan loop)
        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(3_000);   // pequeña pausa para que el sistema esté listo

                var templates = await _api.GetTemplatesAsync();
                if (templates.Count > 0)
                {
                    _matcher.ReloadCache(templates);
                    _cache.SaveTemplates(templates);
                    _lastCacheReload = DateTime.UtcNow;
                    _log.LogInformation("Templates actualizados desde API: {N}.", _matcher.CacheSize);
                }

                var members = await _api.GetMembersAsync();
                if (members.Count > 0)
                {
                    _cache.SaveMembers(members);
                    _log.LogInformation("Socios actualizados desde API: {N}.", _cache.MemberCount);
                }
            }
            catch (Exception ex) { _log.LogWarning(ex, "Refresco inicial desde API falló (sin internet)."); }
        });
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
                        _log.LogWarning("Reinicialización fallida. Reintentando en 20 s...");
                        await Task.Delay(20_000, ct);
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

                // Recargar cache si procede
                bool cacheEmpty = _matcher.CacheSize == 0
                    && (DateTime.UtcNow - _lastCacheReload) >= CacheRetryInterval;
                bool cacheStale = (DateTime.UtcNow - _lastCacheReload) >= CacheRefreshInterval;
                if (cacheEmpty || cacheStale)
                    await RefreshCacheAsync();

                var matchedId = _matcher.Match(probePng, _log);

                if (matchedId.HasValue)
                {
                    _log.LogInformation("Socio identificado: user_id={Id}", matchedId.Value);

                    // 1. Resultado inmediato desde cache local (sin esperar internet)
                    var member      = _cache.GetMember(matchedId.Value);
                    bool granted    = member?.HasActiveMembership ?? false;
                    string status   = granted ? "granted" : "denied";
                    SetLastScan(matchedId.Value, status, member);

                    // 2. Registrar en la API remota (best-effort, 5 s timeout)
                    var (_, _, isOnline) = await _api.VerifyAsync(matchedId.Value);
                    if (!isOnline)
                        _cache.EnqueueScan(new PendingScan(matchedId.Value, DateTime.UtcNow, status));

                    _log.LogInformation("Acceso: {S} (online={O})", status.ToUpper(), isOnline);
                    await Task.Delay(1_000, ct);
                }
                else
                {
                    // Sin match: forzar recarga si el cache puede estar desactualizado
                    if ((DateTime.UtcNow - _lastCacheReload) >= TimeSpan.FromSeconds(30))
                        await RefreshCacheAsync();
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

    private async Task RefreshCacheAsync()
    {
        var templates = await _api.GetTemplatesAsync();
        if (templates.Count > 0)
        {
            _matcher.ReloadCache(templates);
            _cache.SaveTemplates(templates);
        }
        var members = await _api.GetMembersAsync();
        if (members.Count > 0)
            _cache.SaveMembers(members);
        _lastCacheReload = DateTime.UtcNow;
        _log.LogInformation("Cache recargado: {T} templates, {M} socios.",
            _matcher.CacheSize, _cache.MemberCount);
    }

    // ── Sync loop: sube cola offline cada 60 s ────────────────────────────
    private async Task SyncLoop(CancellationToken ct)
    {
        _log.LogInformation("Sync loop iniciado.");
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(60_000, ct);

                if (_cache.QueueCount == 0) continue;

                var pending = _cache.DrainQueue();
                bool synced = await _api.SyncScansAsync(pending);
                if (!synced)
                {
                    // Reencolar si no hubo conexión
                    foreach (var s in pending) _cache.EnqueueScan(s);
                    _log.LogWarning("SyncLoop: {N} scans reencolados (sin internet).", pending.Count);
                }
                else
                {
                    _log.LogInformation("SyncLoop: {N} scans offline sincronizados.", pending.Count);
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { _log.LogError(ex, "Error en sync loop"); }
        }
    }

    // ── Guarda el último scan en memoria (con formato para ScannerDisplay) ─
    private void SetLastScan(int userId, string status, CachedMember? member)
    {
        long scanId    = System.Threading.Interlocked.Increment(ref _scanIdCounter);
        var  scannedAt = DateTime.UtcNow;

        // Membresía simplificada (sólo lo que ScannerDisplay necesita)
        var memberships = new List<object>();
        if (member?.HasActiveMembership == true)
            memberships.Add(new { is_active = true, end_date = member.EndDate ?? "" });

        object userObj = member == null
            ? new { id = userId, name = "Socio", photo_url = (string?)null,
                    role = "socio", memberships = (object)new object[] { },
                    reservations = new object[] { } }
            : new { id       = member.Id,
                    name     = member.Name,
                    photo_url = member.PhotoUrl,
                    role     = member.Role,
                    memberships = (object)memberships,
                    reservations = (object)new object[] { } };

        string json = JsonSerializer.Serialize(new
        {
            id         = scanId,
            user_id    = userId,
            status,
            scanned_at = scannedAt.ToString("yyyy-MM-dd HH:mm:ss"),
            user       = userObj,
        });

        lock (_lastScanLock)
        {
            _lastScanJson = json;
            _lastScanAt   = scannedAt;
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
                await WriteJson(res, new
                {
                    ready    = _reader.IsReady,
                    capturing = Capturing,
                    members  = _cache.MemberCount,
                    queue    = _cache.QueueCount,
                });

            else if (path == "/recent-scan" && req.HttpMethod == "GET")
            {
                string? json;
                DateTime scanAt;
                lock (_lastScanLock) { json = _lastScanJson; scanAt = _lastScanAt; }

                // Expira igual que la API remota: 30 segundos
                bool valid = json != null && (DateTime.UtcNow - scanAt).TotalSeconds <= 30;
                await WriteRaw(res, valid ? json! : "null");
            }

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

    // ── Enrolamiento ──────────────────────────────────────────────────────
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

            var templateBase64 = SourceAFISMatcher.BuildAndSerialize(png);
            _log.LogInformation("Template serializado: {KB}KB", templateBase64.Length / 1024);
            var (ok, msg) = await _api.EnrollAsync(userId, templateBase64);

            if (ok)
            {
                _matcher.AddToCache(userId, templateBase64);
                _log.LogInformation("Huella enrolada para user_id={Id}.", userId);
                // Refrescar cache de socios para que el nuevo aparezca de inmediato
                _ = Task.Run(async () =>
                {
                    var members = await _api.GetMembersAsync();
                    if (members.Count > 0) _cache.SaveMembers(members);
                });
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
                await RefreshCacheAsync();

            var uid = _matcher.Match(png, _log);
            if (uid.HasValue)
            {
                var (ok, msg, _) = await _api.VerifyAsync(uid.Value);
                await WriteJson(res, new { ok, msg }, ok ? 200 : 403);
            }
            else
            {
                await WriteJson(res, new { ok = false, msg = "Huella no reconocida." }, 404);
            }
        }
        finally { _captureLock.Release(); }
    }

    // ── Helpers de respuesta HTTP ─────────────────────────────────────────
    static async Task WriteJson(HttpListenerResponse res, object obj, int status = 200)
    {
        res.StatusCode = status;
        byte[] buf = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(obj));
        res.ContentLength64 = buf.Length;
        await res.OutputStream.WriteAsync(buf);
        res.OutputStream.Close();
    }

    static async Task WriteRaw(HttpListenerResponse res, string json, int status = 200)
    {
        res.StatusCode = status;
        byte[] buf = Encoding.UTF8.GetBytes(json);
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
