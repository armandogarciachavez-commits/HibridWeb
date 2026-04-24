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
                    SetLastScan(matchedId.Value, status, member);

                    // 2. Registrar en API remota en background (no bloquea el loop)
                    _ = Task.Run(async () =>
                    {
                        var (_, _, isOnline) = await _api.VerifyAsync(matchedId.Value);
                        if (!isOnline)
                            _cache.EnqueueScan(new PendingScan(matchedId.Value, DateTime.UtcNow, status));
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
                        _matcher.ReloadCache(templates);
                        _cache.SaveTemplates(templates);
                        _log.LogInformation("SyncLoop: templates actualizados: {N}.", _matcher.CacheSize);
                    }
                    var members = await _api.GetMembersAsync();
                    if (members.Count > 0)
                    {
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
        .hdr .ts{color:#666;font-size:clamp(0.8rem,1.4vw,1.1rem);margin-top:6px}
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
        </style></head><body>
        <div id="idle">
          <h1>Bienvenido a HybridTraining</h1>
          <p>Por favor, coloque su huella en el lector</p>
        </div>
        <div id="card"></div>
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
        function poll(){
          var ctrl=new XMLHttpRequest();
          ctrl.open('GET','/recent-scan',true);
          ctrl.timeout=800;
          ctrl.onload=function(){
            try{var d=JSON.parse(ctrl.responseText);if(d&&d.id){render(d);}else{renderIdle();}}catch(e){renderIdle();}
          };
          ctrl.onerror=ctrl.ontimeout=function(){renderIdle();};
          ctrl.send();
        }
        setInterval(poll,500);poll();
        try{document.documentElement.requestFullscreen();}catch(e){}
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
