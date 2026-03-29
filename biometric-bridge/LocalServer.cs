using System.Net;
using System.Text;
using System.Text.Json;
using DPFP;
using DPFP.Processing;

namespace HybridBiometricBridge;

public sealed class LocalServer : IDisposable
{
    private readonly HttpListener          _listener = new();
    private readonly FingerprintReader     _reader;
    private readonly ApiClient             _api;
    private readonly ILogger<LocalServer>  _log;
    private readonly CancellationTokenSource _cts = new();

    // State for multi-step enrollment (keyed by user_id)
    private readonly Dictionary<int, Enrollment> _enrollments = new();
    private readonly SemaphoreSlim _captureLock = new(1, 1);

    private Task? _loop;
    private Task? _scanLoop;
    public bool Capturing => _captureLock.CurrentCount == 0;

    public LocalServer(FingerprintReader reader, ApiClient api,
                       IConfiguration cfg, ILogger<LocalServer> log)
    {
        _reader = reader;
        _api    = api;
        _log    = log;

        int port = cfg.GetValue<int>("Bridge:LocalPort", 7071);
        _listener.Prefixes.Add($"http://localhost:{port}/");
    }

    public void Start()
    {
        _listener.Start();
        _log.LogInformation("Servidor local iniciado en {Prefix}",
                            _listener.Prefixes.First());
        _loop     = Task.Run(ListenLoop);
        _scanLoop = Task.Run(() => ScanLoop(_cts.Token));
    }

    // ── Continuous scan loop ──────────────────────────────────────────────
    private async Task ScanLoop(CancellationToken ct)
    {
        _log.LogInformation("Modo escaneo continuo iniciado.");
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!_reader.IsReady)
                {
                    await Task.Delay(2_000, ct);
                    continue;
                }

                // Wait until capture lock is free
                await _captureLock.WaitAsync(ct);
                FeatureSet? features = null;
                try
                {
                    using var scanCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    scanCts.CancelAfter(TimeSpan.FromSeconds(10));
                    features = await _reader.CaptureForVerificationAsync(scanCts.Token);
                }
                finally
                {
                    _captureLock.Release();
                }

                if (features is null) continue;

                // Match against stored templates
                var templates = await _api.GetTemplatesAsync();
                int? matchedId = null;
                foreach (var (uid, tmpl) in templates)
                {
                    if (TemplateMatcher.IsMatch(features!, tmpl))
                    {
                        matchedId = uid;
                        break;
                    }
                }

                if (matchedId.HasValue)
                {
                    _log.LogInformation("Socio identificado: user_id={Id}", matchedId.Value);
                    var (ok, msg) = await _api.VerifyAsync(matchedId.Value);
                    _log.LogInformation("Acceso: {Status} — {Msg}", ok ? "GRANTED" : "DENIED", msg);
                    // Brief pause after successful scan to avoid duplicate logs
                    await Task.Delay(3_000, ct);
                }
                else
                {
                    _log.LogWarning("Huella no reconocida.");
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
            {
                await WriteJson(res, new { ready = _reader.IsReady, capturing = Capturing });
            }
            else if (path == "/enroll" && req.HttpMethod == "POST")
            {
                await HandleEnroll(req, res);
            }
            else if (path == "/scan" && req.HttpMethod == "POST")
            {
                await HandleScan(res);
            }
            else if (path == "/abort" && req.HttpMethod == "POST")
            {
                _reader.AbortCapture();
                await WriteJson(res, new { ok = true, msg = "Captura cancelada." });
            }
            else
            {
                await WriteJson(res, new { msg = "Ruta no encontrada." }, 404);
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error procesando {Path}", path);
            await WriteJson(res, new { ok = false, msg = ex.Message }, 500);
        }
    }

    // ── Multi-step enrollment ─────────────────────────────────────────────
    private async Task HandleEnroll(HttpListenerRequest req, HttpListenerResponse res)
    {
        using var sr = new StreamReader(req.InputStream);
        var body     = JsonSerializer.Deserialize<JsonElement>(await sr.ReadToEndAsync());
        int userId   = body.GetProperty("user_id").GetInt32();

        if (!await _captureLock.WaitAsync(0))
        {
            await WriteJson(res, new { ok = false, msg = "Ya hay una captura en curso." }, 409);
            return;
        }

        try
        {
            _log.LogInformation("Capturando muestra de enrolamiento para user_id={Id}...", userId);

            using var enrollCts = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token);
            enrollCts.CancelAfter(TimeSpan.FromSeconds(20));

            var features = await _reader.CaptureForEnrollmentAsync(enrollCts.Token);
            if (features == null)
            {
                _enrollments.Remove(userId);
                await WriteJson(res, new { ok = false, msg = "No se pudo capturar la muestra." }, 422);
                return;
            }

            if (!_enrollments.ContainsKey(userId))
                _enrollments[userId] = new Enrollment();

            _enrollments[userId].AddFeatures(features);

            var (templateBase64, isComplete, samplesNeeded) =
                TemplateMatcher.TryBuildTemplate(_enrollments[userId]);

            if (isComplete && templateBase64 != null)
            {
                _enrollments.Remove(userId);
                var (ok, msg) = await _api.EnrollAsync(userId, templateBase64);
                await WriteJson(res,
                    new { ok, msg = ok ? "Huella enrolada correctamente." : msg,
                          status = "complete" },
                    ok ? 200 : 500);
            }
            else
            {
                int collected = _enrollments.ContainsKey(userId)
                    ? (3 - samplesNeeded) : 0;
                await WriteJson(res, new {
                    ok     = true,
                    status = "collecting",
                    msg    = $"Muestra {collected + 1} registrada. Coloca el dedo {samplesNeeded} vez(ces) más.",
                    collected,
                    needed = samplesNeeded
                });
            }
        }
        finally
        {
            _captureLock.Release();
        }
    }

    // ── Manual scan ───────────────────────────────────────────────────────
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

            var features = await _reader.CaptureForVerificationAsync(scanCts.Token);
            if (features == null)
            {
                await WriteJson(res, new { ok = false, msg = "No se pudo leer la huella." }, 422);
                return;
            }

            var templates = await _api.GetTemplatesAsync();
            foreach (var (uid, tmpl) in templates)
            {
                if (TemplateMatcher.IsMatch(features!, tmpl))
                {
                    var (ok, msg) = await _api.VerifyAsync(uid);
                    await WriteJson(res, new { ok, msg }, ok ? 200 : 403);
                    return;
                }
            }

            await WriteJson(res, new { ok = false, msg = "Huella no reconocida." }, 404);
        }
        finally
        {
            _captureLock.Release();
        }
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
        _listener.Stop();
        _listener.Close();
    }
}
