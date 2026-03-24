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

    // ── Enrolar: guarda huella de un socio ───────────────────────────────
    public async Task<(bool ok, string msg)> EnrollAsync(int userId, string template)
    {
        try
        {
            var res = await _http.PostAsJsonAsync($"{_base}/api/biometric/enroll",
                new { user_id = userId, template_data = template });

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

    // ── Escanear: identifica quién puso el dedo ──────────────────────────
    public async Task<(bool ok, string msg)> ScanAsync(string template)
    {
        try
        {
            var res = await _http.PostAsJsonAsync($"{_base}/api/biometric/scan",
                new { template_data = template });

            var body = await res.Content.ReadFromJsonAsync<JsonElement>();
            string msg = body.TryGetProperty("message", out var m) ? m.GetString()! : "";
            return (res.IsSuccessStatusCode, msg);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error al escanear");
            return (false, ex.Message);
        }
    }
}
