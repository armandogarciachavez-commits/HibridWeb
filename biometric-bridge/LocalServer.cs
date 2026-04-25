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

    // ── Estado de conectividad (para panel de status y logs) ──────────────
    private volatile bool _online = false;
    private DateTime _lastOnlineAt  = DateTime.MinValue;
    private DateTime _lastSyncAt    = DateTime.MinValue;
    private readonly DateTime _startedAt = DateTime.UtcNow;

    private void MarkOnline()
    {
        _online      = true;
        _lastOnlineAt = DateTime.UtcNow;
    }

    private bool IsOnline => _online && (DateTime.UtcNow - _lastOnlineAt).TotalMinutes < 5;

    private string StatusMessage()
    {
        int q = _cache.QueueCount;
        if (!IsOnline && q > 0)  return $"Sin internet — {q} acceso{(q==1?"":"s")} pendiente{(q==1?"":"s")}";
        if (!IsOnline)            return "Sin internet — modo local activo";
        if (q > 0)                return $"{q} acceso{(q==1?"":"s")} pendiente{(q==1?"":"s")} por sincronizar";
        return "Listo";
    }

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
    // IMPORTANTE: este loop NO hace llamadas a la API. Solo captura, matchea
    // y muestra. Todo lo que involucre red está en SyncLoop.
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

                var matchedId = _matcher.Match(probePng, _log);

                if (matchedId.HasValue)
                {
                    _log.LogInformation("Socio identificado: user_id={Id}", matchedId.Value);

                    // 1. Resultado inmediato desde cache local (sin red)
                    var member   = _cache.GetMember(matchedId.Value);
                    bool granted = member?.HasActiveMembership ?? false;
                    string status = granted ? "granted" : "denied";
                    string reason = granted ? "" : (member == null ? "Socio no registrado" : "Membresía inactiva");
                    SetLastScan(matchedId.Value, status, member, reason);

                    // 2. Registrar en API remota en background (no bloquea el loop)
                    _ = Task.Run(async () =>
                    {
                        var (_, _, isOnline) = await _api.VerifyAsync(matchedId.Value);
                        if (isOnline)  MarkOnline();
                        else           _cache.EnqueueScan(new PendingScan(matchedId.Value, DateTime.UtcNow, status));
                        _log.LogInformation("Acceso: {S} (online={O})", status.ToUpper(), isOnline);
                    });

                    await Task.Delay(1_000, ct);
                }
                else
                {
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

    // ── Sync loop: refresca cache + sube cola offline ─────────────────────
    // Toda llamada a la API ocurre aquí, nunca en ScanLoop.
    private async Task SyncLoop(CancellationToken ct)
    {
        _log.LogInformation("Sync loop iniciado.");
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(60_000, ct);

                // 1. Sincronizar cola de scans offline
                if (_cache.QueueCount > 0)
                {
                    var pending = _cache.DrainQueue();
                    bool synced = await _api.SyncScansAsync(pending);
                    if (!synced)
                    {
                        foreach (var s in pending) _cache.EnqueueScan(s);
                        _log.LogWarning("SyncLoop: {N} scans reencolados (sin internet).", pending.Count);
                    }
                    else
                    {
                        MarkOnline();
                        _lastSyncAt = DateTime.UtcNow;
                        _log.LogInformation("SyncLoop: {N} scans offline sincronizados.", pending.Count);
                    }
                }

                // 2. Refrescar templates y socios si es necesario
                bool stale = (DateTime.UtcNow - _lastCacheReload) >= CacheRefreshInterval;
                if (stale || _matcher.CacheSize == 0)
                {
                    var templates = await _api.GetTemplatesAsync();
                    if (templates.Count > 0)
                    {
                        MarkOnline();
                        _matcher.ReloadCache(templates);
                        _cache.SaveTemplates(templates);
                        _log.LogInformation("SyncLoop: templates actualizados: {N}.", _matcher.CacheSize);
                    }
                    var members = await _api.GetMembersAsync();
                    if (members.Count > 0)
                    {
                        MarkOnline();
                        _lastSyncAt = DateTime.UtcNow;
                        _cache.SaveMembers(members);
                        _log.LogInformation("SyncLoop: socios actualizados: {N}.", _cache.MemberCount);
                    }
                    if (templates.Count > 0 || members.Count > 0)
                        _lastCacheReload = DateTime.UtcNow;
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { _log.LogError(ex, "Error en sync loop"); }
        }
    }

    // ── Guarda el último scan en memoria (con formato para ScannerDisplay) ─
    private void SetLastScan(int userId, string status, CachedMember? member, string reason = "")
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
            reason,
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
                    ready          = _reader.IsReady,
                    capturing      = Capturing,
                    members        = _cache.MemberCount,
                    templates      = _matcher.CacheSize,
                    queue          = _cache.QueueCount,
                    online         = IsOnline,
                    last_sync_at   = _lastSyncAt == DateTime.MinValue
                                        ? (string?)null
                                        : _lastSyncAt.ToLocalTime().ToString("HH:mm"),
                    uptime_seconds = (long)(DateTime.UtcNow - _startedAt).TotalSeconds,
                    status_msg     = StatusMessage(),
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
            else if (path == "/search" && req.HttpMethod == "GET")
            {
                string q = req.QueryString["q"] ?? "";
                var found = _cache.SearchMembers(q);
                await WriteJson(res, found.Select(m => new {
                    id = m.Id, name = m.Name, photo_url = m.PhotoUrl,
                    role = m.Role, has_active_membership = m.HasActiveMembership,
                    days_left = m.DaysLeft, end_date = m.EndDate
                }).ToArray());
            }

            else if (path == "/manual-access" && req.HttpMethod == "POST")
                await HandleManualAccess(req, res);

            else if (path == "/reception" && req.HttpMethod == "GET")
                await WriteHtml(res, ReceptionHtml);

            else if (path == "/proxy/reservations" && req.HttpMethod == "GET")
            {
                // Proxy: el browser local pide reservaciones al bridge, el bridge las busca en el VPS.
                // Si no hay internet, devuelve [] sin romper nada.
                if (!int.TryParse(req.QueryString["user_id"], out int uid))
                { await WriteRaw(res, "[]"); return; }
                var rsvs = await _api.GetReservationsForUserAsync(uid);
                await WriteRaw(res, JsonSerializer.Serialize(rsvs));
            }

            else if ((path == "/" || path == "/display") && req.HttpMethod == "GET")
                await WriteHtml(res, ScannerHtml);

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

    // ── Acceso manual (desde panel de recepción) ──────────────────────────
    private async Task HandleManualAccess(HttpListenerRequest req, HttpListenerResponse res)
    {
        try
        {
            using var sr = new StreamReader(req.InputStream);
            var body   = JsonSerializer.Deserialize<JsonElement>(await sr.ReadToEndAsync());
            int userId = body.GetProperty("user_id").GetInt32();

            var member  = _cache.GetMember(userId);
            bool granted = member?.HasActiveMembership ?? false;
            string status = granted ? "granted" : "denied";
            string reason = granted ? ""
                : (member == null ? "Socio no registrado" : "Membresía inactiva");

            SetLastScan(userId, status, member, reason);

            _ = Task.Run(async () =>
            {
                var (_, _, isOnline) = await _api.VerifyAsync(userId);
                if (isOnline) MarkOnline();
                else _cache.EnqueueScan(new PendingScan(userId, DateTime.UtcNow, status));
            });

            await WriteJson(res, new { ok = true, status, reason });
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "HandleManualAccess error");
            await WriteJson(res, new { ok = false, msg = ex.Message }, 400);
        }
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

    static async Task WriteHtml(HttpListenerResponse res, string html, int status = 200)
    {
        res.StatusCode  = status;
        res.ContentType = "text/html; charset=utf-8";
        byte[] buf = Encoding.UTF8.GetBytes(html);
        res.ContentLength64 = buf.Length;
        await res.OutputStream.WriteAsync(buf);
        res.OutputStream.Close();
    }

    // ── Pantalla de scanner local (sirve sin internet) ────────────────────
    private const string ScannerHtml = """
        <!DOCTYPE html><html lang="es"><head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>HybridTraining · Scanner</title>
        <style>
        *{margin:0;padding:0;box-sizing:border-box}
        html,body{width:100%;height:100%}
        body{background:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          display:flex;flex-direction:column;justify-content:center;align-items:center;
          min-height:100vh;overflow:hidden;color:#fff}
        #idle{text-align:center}
        #idle h1{color:#3a3a3a;font-size:clamp(1.8rem,4vw,3.5rem);font-weight:800;
          text-transform:uppercase;letter-spacing:4px}
        #idle p{color:#2a2a2a;font-size:clamp(0.9rem,1.8vw,1.4rem);margin-top:16px}
        #card{width:80vw;max-height:80vh;border-radius:20px;
          padding:clamp(16px,3vh,32px) clamp(20px,3vw,40px);
          box-sizing:border-box;display:none;flex-direction:column;
          gap:clamp(10px,2vh,20px);overflow:hidden;
          background:linear-gradient(145deg,rgba(255,255,255,0.04),rgba(0,0,0,0.85))}
        @keyframes fadeIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
        .fade{animation:fadeIn .4s ease-out}
        .hdr{text-align:center;padding-bottom:clamp(8px,1.5vh,16px);border-bottom:1px solid #222}
        .hdr h2{font-size:clamp(1.6rem,4vw,3.2rem);font-weight:900;text-transform:uppercase;line-height:1.1}
        .hdr .reason{font-size:clamp(0.8rem,1.3vw,1rem);margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:2px}
        .hdr .ts{color:#666;font-size:clamp(0.8rem,1.4vw,1.1rem);margin-top:4px}
        .bdy{display:flex;gap:clamp(16px,3vw,36px);align-items:flex-start;flex:1;min-height:0}
        .lft{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:clamp(8px,1.5vh,14px)}
        .avatar{width:clamp(90px,13vh,160px);height:clamp(90px,13vh,160px);border-radius:50%;
          border:4px solid;object-fit:cover}
        .avatar-init{width:clamp(90px,13vh,160px);height:clamp(90px,13vh,160px);border-radius:50%;
          border:4px solid;display:flex;align-items:center;justify-content:center;
          font-size:clamp(2rem,5vh,4rem);font-weight:700}
        .uname{font-size:clamp(0.9rem,1.8vw,1.5rem);font-weight:700;text-align:center}
        .urole{color:#888;font-size:clamp(0.7rem,1.1vw,0.9rem);text-transform:uppercase;
          letter-spacing:2px;text-align:center;margin-top:4px}
        .rgt{flex:1;display:flex;flex-direction:column;gap:clamp(8px,1.5vh,14px);min-width:0}
        .box{background:rgba(255,255,255,0.03);padding:clamp(10px,2vh,18px) clamp(12px,2vw,20px);
          border-radius:12px;border:1px solid #2a2a2a}
        .box-lbl{color:#666;font-size:clamp(0.65rem,1vw,0.8rem);text-transform:uppercase;
          letter-spacing:2px;font-weight:700;margin-bottom:8px}
        .badge{display:inline-block;padding:4px 16px;border-radius:20px;font-weight:700;
          font-size:clamp(0.8rem,1.4vw,1.1rem)}
        .ri{display:flex;justify-content:space-between;align-items:center;
          background:#111;padding:clamp(8px,1.2vh,12px) clamp(10px,1.5vw,16px);
          border-radius:8px;border-left:4px solid}
        .rt{background:rgba(255,255,255,0.08);padding:4px 12px;border-radius:6px;
          font-size:clamp(0.75rem,1.2vw,0.95rem);font-weight:700;white-space:nowrap}
        /* ── Barra de estado (esquina inferior derecha) ── */
        #sb{position:fixed;bottom:10px;right:14px;display:flex;align-items:center;gap:10px;
          background:rgba(0,0,0,0.55);border:1px solid #1c1c1c;border-radius:8px;
          padding:5px 12px;font-size:0.7rem;color:#444;user-select:none}
        #sb .dot{font-size:0.55rem;transition:color .5s}
        </style></head><body>
        <div id="idle">
          <h1>Bienvenido a HybridTraining</h1>
          <p>Por favor, coloque su huella en el lector</p>
        </div>
        <div id="card"></div>
        <!-- Barra de estado: internet · última sync · cola pendiente -->
        <div id="sb">
          <span class="dot" id="inet-dot" style="color:#333">●</span>
          <span id="inet-txt">--</span>
          <span style="color:#1c1c1c">|</span>
          <span id="sync-txt">--</span>
          <span style="color:#1c1c1c">|</span>
          <span id="msg-txt">--</span>
        </div>
        <script>
        var lastId=null;
        function fmtTime(ts){
          return new Date(ts.replace(' ','T')+'Z').toLocaleTimeString('es-MX',
            {timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
        }
        function initials(n){return(n||'').split(' ').slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase()||'?';}
        function bgColor(n){var h=0;for(var i=0;i<(n||'').length;i++)h=(h*31+n.charCodeAt(i))%360;return'hsl('+h+',50%,35%)';}
        function renderIdle(){document.getElementById('idle').style.display='block';document.getElementById('card').style.display='none';}
        function render(s){
          var acc=s.status==='granted'?'#00cc66':'#ff4444';
          var u=s.user||{};
          var granted=s.status==='granted';
          var mbs=u.memberships||[];
          var mp=null;for(var i=0;i<mbs.length;i++){if(mbs[i].is_active){mp=mbs[i];break;}}
          var activePlan=granted?mp:null;
          var days=0;
          if(activePlan&&activePlan.end_date)days=Math.ceil((new Date(activePlan.end_date)-Date.now())/864e5);
          var fname=(u.name||'').split(' ')[0];
          var photoHtml;
          if(u.photo_url){
            photoHtml='<img class="avatar" style="border-color:'+acc+'" src="'+u.photo_url+'" alt="'+
              (u.name||'')+'" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'+
              '<div class="avatar-init" style="border-color:'+acc+';background:'+bgColor(u.name)+';display:none">'+initials(u.name)+'</div>';
          }else{
            photoHtml='<div class="avatar-init" style="border-color:'+acc+';background:'+bgColor(u.name)+'">'+initials(u.name)+'</div>';
          }
          var membHtml=activePlan?
            '<span class="badge" style="background:rgba(0,204,102,.15);color:#00cc66">ACTIVO</span>'+
            '<span style="color:#ccc;font-size:clamp(0.75rem,1.3vw,1rem)">Renueva en <strong style="color:'+(days<=7?'#ff9900':'#00cc66')+'">'+days+' d\u00edas</strong></span>':
            '<span class="badge" style="background:rgba(255,68,68,.15);color:#ff4444">INACTIVO</span>'+
            '<span style="color:#ccc;font-size:clamp(0.75rem,1.3vw,1rem)">Sin plan vigente.</span>';
          var rsvs=u.reservations||[];
          var resvHtml='';
          if(rsvs.length){
            for(var j=0;j<rsvs.length;j++){
              var r=rsvs[j];var cs=r.class_session||{};var gc=cs.gym_class||{};var clr=gc.color||'#00cc66';
              resvHtml+='<div class="ri" style="border-left-color:'+clr+'">'+
                '<div><span style="color:#fff;font-size:clamp(0.75rem,1.3vw,1rem);font-weight:700;display:block;margin-bottom:2px">'+(gc.name||'Clase')+'</span>'+
                '<span style="color:#777;font-size:clamp(0.65rem,1vw,0.8rem)">Instructor: '+(cs.instructor||'Gimnasio')+'</span></div>'+
                '<div class="rt">'+(cs.start_time||'').substring(0,5)+' - '+(cs.end_time||'').substring(0,5)+'</div></div>';
            }
          }else{
            resvHtml='<p style="color:#555;font-style:italic;font-size:clamp(0.75rem,1.2vw,0.95rem)">No hay clases separadas para hoy.</p>';
          }
          /* Motivo del rechazo (solo si denegado) */
          var reasonHtml=(!granted&&s.reason)?'<p class="reason" style="color:'+acc+'">'+s.reason+'</p>':'';
          var card=document.getElementById('card');
          card.className='fade';
          card.style.cssText='display:flex;flex-direction:column;width:80vw;max-height:80vh;'+
            'border-radius:20px;padding:clamp(16px,3vh,32px) clamp(20px,3vw,40px);'+
            'gap:clamp(10px,2vh,20px);overflow:hidden;box-sizing:border-box;'+
            'border:3px solid '+acc+';'+
            'background:linear-gradient(145deg,rgba(255,255,255,0.04),rgba(0,0,0,0.85));'+
            'box-shadow:0 8px 40px '+(granted?'rgba(0,204,102,0.18)':'rgba(255,68,68,0.18)')+';';
          card.innerHTML=
            '<div class="hdr"><h2 style="color:'+acc+'">'+(granted?'\u00a1BIENVENIDO, '+fname+'!':'ACCESO DENEGADO')+'</h2>'+
            reasonHtml+
            '<p class="ts">'+(s.scanned_at?fmtTime(s.scanned_at):'')+' </p></div>'+
            '<div class="bdy">'+
              '<div class="lft">'+photoHtml+
                '<div><div class="uname">'+(u.name||'')+'</div><div class="urole">'+(u.role||'')+'</div></div>'+
              '</div>'+
              '<div class="rgt">'+
                '<div class="box"><div class="box-lbl">Membres\u00eda</div>'+
                '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">'+membHtml+'</div></div>'+
                '<div class="box" style="flex:1;min-height:0;overflow:hidden"><div class="box-lbl">Agenda del D\u00eda</div>'+
                '<div style="display:flex;flex-direction:column;gap:8px">'+resvHtml+'</div></div>'+
              '</div>'+
            '</div>';
          document.getElementById('idle').style.display='none';
        }
        /* ── Polling de scan ── */
        function poll(){
          var x=new XMLHttpRequest();x.open('GET','/recent-scan',true);x.timeout=800;
          x.onload=function(){
            try{
              var d=JSON.parse(x.responseText);
              if(d&&d.id){
                render(d);
                /* Nuevo scan: buscar reservaciones vía proxy del bridge (falla silencioso offline) */
                if(d.id!==lastId){
                  lastId=d.id;
                  setTimeout(function(){
                    var r=new XMLHttpRequest();
                    r.open('GET','/proxy/reservations?user_id='+d.user_id,true);
                    r.timeout=3000;
                    r.onload=function(){
                      try{
                        var rsvs=JSON.parse(r.responseText);
                        if(rsvs&&rsvs.length>0){
                          d.user.reservations=rsvs;
                          render(d);  /* re-render con agenda del día */
                        }
                      }catch(e){}
                    };
                    r.send();
                  },2000);
                }
              }else{renderIdle();}
            }catch(e){renderIdle();}
          };
          x.onerror=x.ontimeout=function(){renderIdle();};x.send();
        }
        /* ── Polling de status (barra inferior) ── */
        function pollStatus(){
          var x=new XMLHttpRequest();x.open('GET','/status',true);x.timeout=1000;
          x.onload=function(){
            try{
              var s=JSON.parse(x.responseText);
              var online=s.online;
              document.getElementById('inet-dot').style.color=online?'#00cc66':'#ff4444';
              document.getElementById('inet-txt').textContent=online?'Internet':'Sin red';
              document.getElementById('sync-txt').textContent=s.last_sync_at?('Sync '+s.last_sync_at):'Sin sync';
              document.getElementById('msg-txt').textContent=s.status_msg||'';
            }catch(e){}
          };
          x.send();
        }
        setInterval(poll,500);poll();
        setInterval(pollStatus,5000);pollStatus();
        try{document.documentElement.requestFullscreen();}catch(e){}
        </script></body></html>
        """;

    // ── Panel de recepción (Monitor 1 — funciona 100 % offline) ──────────
    private const string ReceptionHtml = """
        <!DOCTYPE html><html lang="es"><head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>HybridTraining · Recepción</title>
        <style>
        *{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e0e0e0}
        /* ── Topbar ── */
        #topbar{display:flex;align-items:center;gap:12px;padding:8px 18px;
          background:#111;border-bottom:1px solid #1e1e1e;font-size:0.72rem;color:#555}
        #topbar .dot{font-size:0.5rem;transition:color .5s}
        #topbar .sep{color:#222}
        #topbar .title{font-weight:700;font-size:0.85rem;color:#aaa;margin-right:auto}
        /* ── Layout 2 columnas ── */
        #wrap{display:flex;height:calc(100vh - 35px);gap:0}
        /* ── Columna izquierda: último scan ── */
        #left{flex:0 0 50%;border-right:1px solid #1a1a1a;display:flex;flex-direction:column;
          align-items:center;justify-content:center;padding:24px;gap:16px;overflow:hidden}
        #scan-idle{text-align:center;color:#2a2a2a}
        #scan-idle h2{font-size:1.8rem;font-weight:800;text-transform:uppercase;letter-spacing:3px}
        #scan-idle p{margin-top:8px;font-size:0.9rem}
        #scan-card{display:none;width:100%;border-radius:16px;padding:20px 24px;
          background:linear-gradient(145deg,rgba(255,255,255,0.04),rgba(0,0,0,0.85));
          border:2px solid #222}
        @keyframes pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
        .pop{animation:pop .35s ease-out}
        .sc-status{font-size:1.4rem;font-weight:900;text-transform:uppercase;
          letter-spacing:3px;text-align:center}
        .sc-reason{font-size:0.75rem;font-weight:700;text-transform:uppercase;
          letter-spacing:2px;text-align:center;margin-top:2px}
        .sc-ts{color:#555;font-size:0.78rem;text-align:center;margin-top:2px;margin-bottom:12px}
        .sc-row{display:flex;align-items:center;gap:16px}
        .sc-avatar{width:72px;height:72px;border-radius:50%;border:3px solid;object-fit:cover;flex-shrink:0}
        .sc-init{width:72px;height:72px;border-radius:50%;border:3px solid;
          display:flex;align-items:center;justify-content:center;font-size:1.8rem;
          font-weight:700;flex-shrink:0}
        .sc-name{font-size:1.1rem;font-weight:700}
        .sc-role{color:#666;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin-top:2px}
        .sc-badge{display:inline-block;padding:2px 12px;border-radius:12px;font-size:0.75rem;font-weight:700;margin-top:8px}
        /* ── Columna derecha: búsqueda ── */
        #right{flex:1;display:flex;flex-direction:column;padding:20px 20px 12px;gap:12px;overflow:hidden}
        #right h3{font-size:0.8rem;font-weight:700;text-transform:uppercase;
          letter-spacing:2px;color:#555;margin-bottom:2px}
        #search-wrap{position:relative}
        #q{width:100%;padding:10px 14px;border-radius:10px;border:1px solid #2a2a2a;
          background:#111;color:#eee;font-size:0.95rem;outline:none;transition:border .2s}
        #q:focus{border-color:#3a7bd5}
        #results{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
        .member-row{display:flex;align-items:center;gap:12px;background:#111;
          border-radius:10px;padding:10px 14px;border:1px solid #1e1e1e;cursor:default}
        .mr-init{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;
          justify-content:center;font-size:1.1rem;font-weight:700;flex-shrink:0}
        .mr-img{width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0}
        .mr-info{flex:1;min-width:0}
        .mr-name{font-weight:700;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .mr-sub{font-size:0.72rem;color:#666;margin-top:1px}
        .mr-badge{font-size:0.68rem;font-weight:700;padding:2px 10px;border-radius:10px;white-space:nowrap}
        .mr-btn{padding:7px 14px;border-radius:8px;border:none;font-size:0.78rem;
          font-weight:700;cursor:pointer;transition:background .2s;white-space:nowrap}
        .mr-btn:disabled{opacity:0.45;cursor:not-allowed}
        #empty{text-align:center;color:#2a2a2a;padding:40px 0;font-size:0.85rem;display:none}
        </style></head><body>
        <!-- Topbar -->
        <div id="topbar">
          <span class="title">HybridTraining · Recepción</span>
          <span class="dot" id="inet-dot" style="color:#333">●</span>
          <span id="inet-txt">--</span>
          <span class="sep">|</span>
          <span id="sync-txt">--</span>
          <span class="sep">|</span>
          <span id="members-txt">-- socios</span>
          <span class="sep">|</span>
          <span id="queue-txt">--</span>
        </div>
        <!-- Layout -->
        <div id="wrap">
          <!-- Izquierda: último scan -->
          <div id="left">
            <div id="scan-idle">
              <h2>Esperando escaneo…</h2>
              <p>Aquí aparecerá el próximo socio</p>
            </div>
            <div id="scan-card"></div>
          </div>
          <!-- Derecha: búsqueda + acceso manual -->
          <div id="right">
            <h3>Búsqueda de socios</h3>
            <div id="search-wrap">
              <input id="q" type="search" placeholder="Nombre del socio…" autocomplete="off" />
            </div>
            <div id="results"></div>
            <div id="empty">Sin resultados</div>
          </div>
        </div>
        <script>
        /* ── Utilidades ── */
        function initials(n){return(n||'').split(' ').slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase()||'?';}
        function bgColor(n){var h=0;for(var i=0;i<(n||'').length;i++)h=(h*31+n.charCodeAt(i))%360;return'hsl('+h+',45%,28%)';}
        function fmtTime(ts){try{return new Date(ts.replace(' ','T')+'Z').toLocaleTimeString('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}catch(e){return ts||'';}}
        /* ── Panel izquierdo: último scan ── */
        var lastScanId=null;
        function renderIdle(){
          document.getElementById('scan-idle').style.display='block';
          document.getElementById('scan-card').style.display='none';
        }
        function renderScan(d){
          var acc=d.status==='granted'?'#00cc66':'#ff4444';
          var u=d.user||{};
          var granted=d.status==='granted';
          /* Avatar */
          var avatarHtml;
          if(u.photo_url){
            avatarHtml='<img class="sc-avatar" style="border-color:'+acc+'" src="'+u.photo_url+'" '+
              'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'" alt="">'+
              '<div class="sc-init" style="border-color:'+acc+';background:'+bgColor(u.name)+';display:none">'+initials(u.name)+'</div>';
          }else{
            avatarHtml='<div class="sc-init" style="border-color:'+acc+';background:'+bgColor(u.name)+'">'+initials(u.name)+'</div>';
          }
          /* Membresía */
          var mbs=u.memberships||[];var mp=null;
          for(var i=0;i<mbs.length;i++){if(mbs[i].is_active){mp=mbs[i];break;}}
          var badgeHtml=mp?
            '<span class="sc-badge" style="background:rgba(0,204,102,.15);color:#00cc66">ACTIVO</span>':
            '<span class="sc-badge" style="background:rgba(255,68,68,.15);color:#ff4444">INACTIVO</span>';
          /* Motivo rechazo */
          var reasonHtml=(!granted&&d.reason)?'<div class="sc-reason" style="color:'+acc+'">'+d.reason+'</div>':'';
          var card=document.getElementById('scan-card');
          card.className='pop';
          card.style.borderColor=acc;
          card.style.boxShadow='0 6px 28px '+(granted?'rgba(0,204,102,0.15)':'rgba(255,68,68,0.15)');
          card.innerHTML=
            '<div class="sc-status" style="color:'+acc+'">'+(granted?'✓ ACCESO':'✗ DENEGADO')+'</div>'+
            reasonHtml+
            '<div class="sc-ts">'+fmtTime(d.scanned_at||'')+'</div>'+
            '<div class="sc-row">'+avatarHtml+
              '<div><div class="sc-name">'+(u.name||'Desconocido')+'</div>'+
              '<div class="sc-role">'+(u.role||'socio')+'</div>'+
              badgeHtml+'</div>'+
            '</div>';
          card.style.display='block';
          document.getElementById('scan-idle').style.display='none';
        }
        function pollScan(){
          var x=new XMLHttpRequest();x.open('GET','/recent-scan',true);x.timeout=800;
          x.onload=function(){
            try{var d=JSON.parse(x.responseText);if(d&&d.id){if(d.id!==lastScanId){lastScanId=d.id;renderScan(d);}
            }else{renderIdle();}}catch(e){renderIdle();}
          };
          x.onerror=x.ontimeout=function(){renderIdle();};
          x.send();
        }
        setInterval(pollScan,500);pollScan();
        /* ── Topbar: status ── */
        function pollStatus(){
          var x=new XMLHttpRequest();x.open('GET','/status',true);x.timeout=1000;
          x.onload=function(){
            try{
              var s=JSON.parse(x.responseText);
              document.getElementById('inet-dot').style.color=s.online?'#00cc66':'#ff4444';
              document.getElementById('inet-txt').textContent=s.online?'Internet':'Sin red';
              document.getElementById('sync-txt').textContent=s.last_sync_at?('Sync '+s.last_sync_at):'Sin sync';
              document.getElementById('members-txt').textContent=(s.members||0)+' socios';
              var q=s.queue||0;
              document.getElementById('queue-txt').textContent=q>0?('⏳ '+q+' pendiente'+(q===1?'':'s')):'Sincronizado';
            }catch(e){}
          };x.send();
        }
        setInterval(pollStatus,5000);pollStatus();
        /* ── Búsqueda de socios ── */
        var searchTimer=null;
        document.getElementById('q').addEventListener('input',function(){
          clearTimeout(searchTimer);
          var v=this.value.trim();
          if(v.length<1){document.getElementById('results').innerHTML='';document.getElementById('empty').style.display='none';return;}
          searchTimer=setTimeout(function(){doSearch(v);},220);
        });
        function doSearch(q){
          var x=new XMLHttpRequest();x.open('GET','/search?q='+encodeURIComponent(q),true);x.timeout=1500;
          x.onload=function(){
            try{renderResults(JSON.parse(x.responseText));}catch(e){}
          };x.send();
        }
        function renderResults(arr){
          var el=document.getElementById('results');
          var empty=document.getElementById('empty');
          el.innerHTML='';
          if(!arr||arr.length===0){empty.style.display='block';return;}
          empty.style.display='none';
          arr.forEach(function(m){
            var active=m.has_active_membership;
            var acc=active?'#00cc66':'#ff4444';
            var avatarHtml;
            if(m.photo_url){
              avatarHtml='<img class="mr-img" src="'+m.photo_url+'" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'" alt="">'+
                '<div class="mr-init" style="background:'+bgColor(m.name)+';display:none">'+initials(m.name)+'</div>';
            }else{
              avatarHtml='<div class="mr-init" style="background:'+bgColor(m.name)+'">'+initials(m.name)+'</div>';
            }
            var daysHtml=active&&m.days_left>0?('<span style="color:#888;font-size:0.68rem">·</span> <span style="font-size:0.68rem;color:'+(m.days_left<=7?'#ff9900':'#888')+'">'+m.days_left+' días</span>'):'';
            var btnBg=active?'rgba(0,204,102,0.15)':'rgba(255,68,68,0.12)';
            var btnColor=active?'#00cc66':'#ff6666';
            var row=document.createElement('div');
            row.className='member-row';
            row.innerHTML=avatarHtml+
              '<div class="mr-info">'+
                '<div class="mr-name">'+m.name+'</div>'+
                '<div class="mr-sub">'+(m.role||'socio')+' '+daysHtml+'</div>'+
              '</div>'+
              '<span class="mr-badge" style="background:'+btnBg+';color:'+acc+'">'+
                (active?'ACTIVO':'INACTIVO')+'</span>'+
              '<button class="mr-btn" data-uid="'+m.id+'" '+
                'style="background:'+btnBg+';color:'+btnColor+';border:1px solid '+acc+'40">'+
                'Registrar acceso</button>';
            row.querySelector('.mr-btn').addEventListener('click',function(){
              var btn=this;btn.disabled=true;btn.textContent='…';
              var uid=parseInt(btn.getAttribute('data-uid'));
              var x2=new XMLHttpRequest();x2.open('POST','/manual-access',true);
              x2.setRequestHeader('Content-Type','application/json');
              x2.timeout=3000;
              x2.onload=function(){
                try{
                  var r=JSON.parse(x2.responseText);
                  btn.textContent=r.status==='granted'?'✓ Registrado':'✗ Denegado';
                  btn.style.color=r.status==='granted'?'#00cc66':'#ff4444';
                }catch(e){btn.textContent='Error';}
                setTimeout(function(){
                  btn.disabled=false;
                  btn.textContent='Registrar acceso';
                  btn.style.color=btnColor;
                },2500);
              };
              x2.onerror=x2.ontimeout=function(){btn.textContent='Error';btn.disabled=false;};
              x2.send(JSON.stringify({user_id:uid}));
            });
            el.appendChild(row);
          });
        }
        </script></body></html>
        """;

    public void Dispose()
    {
        _cts.Cancel();
        if (_listener?.IsListening == true)
            _listener.Stop();
        _listener.Close();
    }
}
