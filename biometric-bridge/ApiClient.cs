using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace HybridBiometricBridge;

public sealed class ApiClient
{
    private readonly HttpClient          _http;
    private readonly string              _base;
    private readonly ILogger<ApiClient>  _log;

    public ApiClient(IHttpClientFactory factory, IConfiguration cfg,
                     ILogger<ApiClient> log)
    {
        _log  = log;
        _base = cfg["Bridge:ApiBase"]!.TrimEnd('/');
        _http = factory.CreateClient("api");
        _http.DefaultRequestHeaders.Add("Authorization",
              $"Bearer {cfg["Bridge:AdminToken"]}");
        _http.DefaultRequestHeaders.Add("Accept", "application/json");
        _http.Timeout = TimeSpan.FromSeconds(60);
    }

    // ── Enrolar: guarda template de un socio ─────────────────────────────
    public async Task<(bool ok, string msg)> EnrollAsync(int userId, string templateBase64)
    {
        try
        {
            var payload = JsonSerializer.Serialize(
                new { user_id = userId, template_data = templateBase64 });
            _log.LogInformation("EnrollAsync → user_id={U}, payload={KB}KB",
                userId, payload.Length / 1024);
            var content = new StringContent(payload, Encoding.UTF8, "application/json");
            var res     = await _http.PostAsync($"{_base}/api/biometric/enroll", content);
            var rawBody = await res.Content.ReadAsStringAsync();
            _log.LogInformation("EnrollAsync ← HTTP {S}: {B}", (int)res.StatusCode, rawBody);
            JsonElement body;
            try { body = JsonSerializer.Deserialize<JsonElement>(rawBody); }
            catch { return (res.IsSuccessStatusCode, rawBody); }
            string msg = body.TryGetProperty("message", out var m) ? m.GetString()! : rawBody;
            return (res.IsSuccessStatusCode, msg);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error al enrolar");
            return (false, ex.Message);
        }
    }

    // ── Obtener todos los templates enrolados ─────────────────────────────
    public async Task<List<(int UserId, string TemplateBase64)>> GetTemplatesAsync()
    {
        try
        {
            var res = await _http.GetAsync($"{_base}/api/biometric/templates");
            if (!res.IsSuccessStatusCode) return [];
            var items  = await res.Content.ReadFromJsonAsync<JsonElement[]>() ?? [];
            var result = new List<(int, string)>();
            foreach (var item in items)
            {
                int    uid  = item.GetProperty("user_id").GetInt32();
                string tmpl = item.GetProperty("template_data").GetString() ?? "";
                if (!string.IsNullOrEmpty(tmpl))
                    result.Add((uid, tmpl));
            }
            return result;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error al obtener templates");
            return [];
        }
    }

    // ── Obtener socios para cache local ───────────────────────────────────
    public async Task<List<CachedMember>> GetMembersAsync()
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var res = await _http.GetAsync($"{_base}/api/biometric/members", cts.Token);
            if (!res.IsSuccessStatusCode) return [];
            var items  = await res.Content.ReadFromJsonAsync<JsonElement[]>(cts.Token) ?? [];
            var result = new List<CachedMember>();
            foreach (var item in items)
            {
                result.Add(new CachedMember(
                    Id:                  item.GetProperty("id").GetInt32(),
                    Name:                item.GetProperty("name").GetString() ?? "",
                    PhotoUrl:            item.TryGetProperty("photo_url", out var p)
                                             ? p.GetString() : null,
                    Role:                item.GetProperty("role").GetString() ?? "socio",
                    HasActiveMembership: item.GetProperty("has_active_membership").GetBoolean(),
                    DaysLeft:            item.TryGetProperty("days_left", out var dl)
                                             ? dl.GetInt32() : 0,
                    EndDate:             item.TryGetProperty("end_date", out var ed)
                                             ? ed.GetString() : null));
            }
            _log.LogInformation("GetMembersAsync: {N} socios descargados.", result.Count);
            return result;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error al obtener socios");
            return [];
        }
    }

    // ── Verificar acceso: registra scan log en la API ─────────────────────
    // Retorna isOnline=false cuando falla por red → el caller encola el scan
    public async Task<(bool ok, string msg, bool isOnline)> VerifyAsync(int userId)
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var payload = JsonSerializer.Serialize(new { user_id = userId });
            _log.LogInformation("VerifyAsync → user_id={U}", userId);
            var content = new StringContent(payload, Encoding.UTF8, "application/json");
            var res     = await _http.PostAsync($"{_base}/api/biometric/verify",
                                                content, cts.Token);
            var rawBody = await res.Content.ReadAsStringAsync();
            _log.LogInformation("VerifyAsync ← HTTP {S}: {B}", (int)res.StatusCode, rawBody);
            JsonElement body;
            try { body = JsonSerializer.Deserialize<JsonElement>(rawBody); }
            catch { return (res.IsSuccessStatusCode, rawBody, true); }
            string msg = body.TryGetProperty("message", out var m) ? m.GetString()! : rawBody;
            return (res.IsSuccessStatusCode, msg, true);
        }
        catch (Exception ex) when (ex is HttpRequestException
                                       or TaskCanceledException
                                       or OperationCanceledException)
        {
            _log.LogWarning("VerifyAsync sin internet: {M}", ex.Message);
            return (false, "Sin conexión", false);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error al verificar");
            return (false, ex.Message, true);
        }
    }

    // ── Sincronizar cola de scans offline ─────────────────────────────────
    public async Task<bool> SyncScansAsync(List<PendingScan> scans)
    {
        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                scans = scans.Select(s => new
                {
                    user_id    = s.UserId,
                    scanned_at = s.ScannedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                    status     = s.Status,
                }).ToArray()
            });
            var content = new StringContent(payload, Encoding.UTF8, "application/json");
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var res = await _http.PostAsync($"{_base}/api/biometric/sync", content, cts.Token);
            if (res.IsSuccessStatusCode)
            {
                _log.LogInformation("SyncScansAsync: {N} scans sincronizados.", scans.Count);
                return true;
            }
            _log.LogWarning("SyncScansAsync falló: HTTP {S}", (int)res.StatusCode);
            return false;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "SyncScansAsync: sin conexión.");
            return false;
        }
    }
}
