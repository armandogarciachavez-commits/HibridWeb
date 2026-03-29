using System.Net;
using System.Text;
using System.Text.Json;

namespace HybridBiometricBridge;

/// <summary>
/// Servidor HTTP local en localhost:7070.
/// La PWA admin lo usa para ordenar enrolamientos en tiempo real.
///
/// Endpoints:
///   GET  /status          → { "ready": true/false }
///   POST /enroll          → Body: { "user_id": 5 }  → espera huella
///   POST /scan            → (sin body) → espera huella y la identifica
///   POST /abort           → cancela captura en curso
/// </summary>
public sealed class LocalServer : IDisposable
{
    private readonly HttpListener          _listener = new();
    private readonly FingerprintReader     _reader;
    private readonly ApiClient             _api;
    private readonly ILogger<LocalServer>  _log;
    private readonly CancellationTokenSource _cts = new();

    private Task? _loop;
    private bool  _capturing = false;

    public LocalServer(FingerprintReader reader, ApiClient api,
                       IConfiguration cfg, ILogger<LocalServer> log)
    {
        _reader = reader;
        _api    = api;
        _log    = log;

        int port = cfg.GetValue<int>("Bridge:LocalPort", 7070);
        _listener.Prefixes.Add($"http://localhost:{port}/");
    }

    public void Start()
    {
        _listener.Start();
        _log.LogInformation("Servidor local iniciado en {Prefix}",
                            _listener.Prefixes.First());
        _loop = Task.Run(ListenLoop);
    }

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
        var req  = ctx.Request;
        var res  = ctx.Response;

        // CORS para la PWA admin
        res.Headers.Add("Access-Control-Allow-Origin",  "*");
        res.Headers.Add("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.Headers.Add("Access-Control-Allow-Headers", "Content-Type,Authorization");
        res.ContentType = "application/json; charset=utf-8";

        if (req.HttpMethod == "OPTIONS")
        {
            res.StatusCode = 204;
            res.Close();
            return;
        }

        string path = req.Url?.AbsolutePath.ToLower() ?? "/";

        try
        {
            if (path == "/status" && req.HttpMethod == "GET")
            {
                await WriteJson(res, new { ready = _reader.IsReady, capturing = _capturing });
            }
            else if (path == "/enroll" && req.HttpMethod == "POST")
            {
                if (_capturing) { await WriteJson(res, new { ok = false, msg = "Ya hay una captura en curso." }, 409); return; }

                using var sr   = new StreamReader(req.InputStream);
                var body       = JsonSerializer.Deserialize<JsonElement>(await sr.ReadToEndAsync());
                int userId     = body.GetProperty("user_id").GetInt32();

                _capturing = true;
                _log.LogInformation("Enrolando user_id={UserId}...", userId);

                string? tmpl = await _reader.CaptureTemplateAsync(_cts.Token);
                _capturing   = false;

                if (tmpl == null)
                {
                    await WriteJson(res, new { ok = false, msg = "No se pudo capturar la huella." }, 422);
                    return;
                }

                var (ok, msg) = await _api.EnrollAsync(userId, tmpl);
                await WriteJson(res, new { ok, msg }, ok ? 200 : 500);
            }
            else if (path == "/scan" && req.HttpMethod == "POST")
            {
                if (_capturing) { await WriteJson(res, new { ok = false, msg = "Ya hay una captura en curso." }, 409); return; }

                _capturing = true;
                _log.LogInformation("Esperando escaneo de entrada...");

                string? tmpl = await _reader.CaptureTemplateAsync(_cts.Token);
                _capturing   = false;

                if (tmpl == null)
                {
                    await WriteJson(res, new { ok = false, msg = "No se pudo leer la huella." }, 422);
                    return;
                }

                var (ok, msg) = await _api.ScanAsync(tmpl);
                await WriteJson(res, new { ok, msg }, ok ? 200 : 404);
            }
            else if (path == "/abort" && req.HttpMethod == "POST")
            {
                _reader.AbortCapture();
                _capturing = false;
                await WriteJson(res, new { ok = true, msg = "Captura cancelada." });
            }
            else
            {
                res.StatusCode = 404;
                await WriteJson(res, new { msg = "Ruta no encontrada." }, 404);
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error procesando {Path}", path);
            await WriteJson(res, new { ok = false, msg = ex.Message }, 500);
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
