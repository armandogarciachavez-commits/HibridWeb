using SourceAFIS;

namespace HybridBiometricBridge;

/// <summary>
/// Maneja enrolamiento y matching de huellas usando SourceAFIS.
/// Reemplaza DPFP.Verification que no funciona en este sistema.
/// </summary>
public sealed class SourceAFISMatcher
{
    private readonly ILogger<SourceAFISMatcher> _log;

    // Cache en memoria: uid → template pre-construido
    private readonly Dictionary<int, FingerprintTemplate> _cache = new();

    // Umbral recomendado por SourceAFIS (40 = ~0.01% FRR)
    private const double Threshold = 40.0;

    public SourceAFISMatcher(ILogger<SourceAFISMatcher> log) => _log = log;

    /// <summary>Recarga el cache desde la lista de templates (base64 de PNG).</summary>
    public void ReloadCache(IEnumerable<(int uid, string base64)> templates)
    {
        _cache.Clear();
        foreach (var (uid, b64) in templates)
        {
            try
            {
                var png  = Convert.FromBase64String(b64);
                _cache[uid] = BuildTemplate(png);
            }
            catch (Exception ex)
            {
                _log.LogWarning("Template uid={U} inválido: {M}", uid, ex.Message);
            }
        }
        _log.LogInformation("Cache SourceAFIS: {N} templates cargados.", _cache.Count);
    }

    /// <summary>Agrega/actualiza un template en el cache sin recargar todo.</summary>
    public void AddToCache(int uid, string base64)
    {
        try
        {
            var png    = Convert.FromBase64String(base64);
            _cache[uid] = BuildTemplate(png);
            _log.LogInformation("Template uid={U} agregado al cache.", uid);
        }
        catch (Exception ex)
        {
            _log.LogWarning("AddToCache uid={U}: {M}", uid, ex.Message);
        }
    }

    /// <summary>Construye un FingerprintTemplate desde bytes PNG de la imagen.</summary>
    public static FingerprintTemplate BuildTemplate(byte[] imagePng)
        => new FingerprintTemplate(new FingerprintImage(imagePng));

    /// <summary>
    /// Compara la huella capturada (PNG) contra todos los templates en cache.
    /// Retorna el uid del mejor match o null si no supera el umbral.
    /// </summary>
    public int? Match(byte[] probePng, ILogger log)
    {
        var probe   = BuildTemplate(probePng);
        var matcher = new FingerprintMatcher(probe);

        int?   bestUid   = null;
        double bestScore = Threshold;

        foreach (var (uid, candidate) in _cache)
        {
            double score = matcher.Match(candidate);
            log.LogDebug("  uid={U} score={S:F1}", uid, score);
            if (score > bestScore)
            {
                bestScore = score;
                bestUid   = uid;
            }
        }

        if (bestUid.HasValue)
            log.LogInformation("Match encontrado: uid={U} score={S:F1}", bestUid, bestScore);
        else
            log.LogWarning("Sin match (mejor score={S:F1}, umbral={T})", bestScore, Threshold);

        return bestUid;
    }

    public int CacheSize => _cache.Count;
}
