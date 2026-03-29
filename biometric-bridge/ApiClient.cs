using System.Net.Http.Json;
using System.Text.Json;

namespace HybridBiometricBridge;

public sealed class ApiClient
{
    private readonly HttpClient _http;
    private readonly string     _base;
    private readonly ILogger<ApiClient> _log;

    public ApiClient(IHttpClientFactory factory, IConfiguration cfg,
                     ILogger<ApiClient> log)
    {
        _log  = log;
        _base = cfg["Bridge:ApiBase"]!.TrimEnd('/');
        _http = factory.CreateClient("api");
        _http.DefaultRequestHeaders.Add("Authorization",
              $"Bearer {cfg["Bridge:AdminToken"]}");
        _http.DefaultRequestHeaders.Add("Accept", "application/json");
    }

    // ── Enrolar: guarda template de un socio ─────────────────────────────
    public async Task<(bool ok, string msg)> EnrollAsync(int userId, string templateBase64)
    {
        try
        {
            var res = await _http.PostAsJsonAsync($"{_base}/api/biometric/enroll",
                new { user_id = userId, template_data = templateBase64 });

            var body = await res.Content.ReadFromJsonAsync<JsonElement>();
            string msg = body.TryGetProperty("message", out var m) ? m.GetString()! : "";
            return (res.IsSuccessStatusCode, msg);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error al enrolar");
            return (false, ex.Message);
        }
    }

    // ── Obtener todos los templates enrolados ─────────────────────────────
    public async Task<List<(int userId, string templateBase64)>> GetTemplatesAsync()
    {
        try
        {
            var res = await _http.GetAsync($"{_base}/api/biometric/templates");
            if (!res.IsSuccessStatusCode) return [];
            var items = await res.Content.ReadFromJsonAsync<JsonElement[]>() ?? [];
            var result = new List<(int, string)>();
            foreach (var item in items)
            {
                int uid     = item.GetProperty("user_id").GetInt32();
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

    // ── Verificar acceso: registra scan log ───────────────────────────────
    public async Task<(bool ok, string msg)> VerifyAsync(int userId)
    {
        try
        {
            var res = await _http.PostAsJsonAsync($"{_base}/api/biometric/verify",
                new { user_id = userId });

            var body = await res.Content.ReadFromJsonAsync<JsonElement>();
            string msg = body.TryGetProperty("message", out var m) ? m.GetString()! : "";
            return (res.IsSuccessStatusCode, msg);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error al verificar");
            return (false, ex.Message);
        }
    }
}
