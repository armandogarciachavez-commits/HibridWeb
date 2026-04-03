using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
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

    // Umbral ajustado para hardware con parseo directo (sin SampleConversion oficial)
    private const double Threshold = 20.0;

    public SourceAFISMatcher(ILogger<SourceAFISMatcher> log) => _log = log;

    /// <summary>
    /// Recarga el cache desde la lista de templates almacenados.
    /// Soporta tanto templates serializados de SourceAFIS (v2, compactos)
    /// como PNG legacy (v1, grandes) para compatibilidad hacia atrás.
    /// </summary>
    public void ReloadCache(IEnumerable<(int uid, string base64)> templates)
    {
        _cache.Clear();
        foreach (var (uid, b64) in templates)
        {
            try
            {
                var png = Convert.FromBase64String(b64);
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
            var png = Convert.FromBase64String(base64);
            _cache[uid] = BuildTemplate(png);
            _log.LogInformation("Template uid={U} agregado al cache.", uid);
        }
        catch (Exception ex)
        {
            _log.LogWarning("AddToCache uid={U}: {M}", uid, ex.Message);
        }
    }

    /// <summary>Retorna el PNG como base64 para almacenamiento (el .htaccess permite hasta 10MB).</summary>
    public static string BuildAndSerialize(byte[] imagePng)
        => Convert.ToBase64String(imagePng);

    /// <summary>Construye un FingerprintTemplate desde bytes PNG de la imagen.</summary>
    public static FingerprintTemplate BuildTemplate(byte[] imagePng)
    {
        using var ms  = new MemoryStream(imagePng);
        using var bmp = new Bitmap(ms);

        int w = bmp.Width, h = bmp.Height;

        // Convierte a escala de grises 8-bit para SourceAFIS
        var pixels = new byte[w * h];
        var rect   = new Rectangle(0, 0, w, h);
        using var bmp24 = bmp.Clone(rect, PixelFormat.Format24bppRgb);
        var bd = bmp24.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        var row = new byte[Math.Abs(bd.Stride)];
        for (int y = 0; y < h; y++)
        {
            Marshal.Copy(bd.Scan0 + y * bd.Stride, row, 0, row.Length);
            for (int x = 0; x < w; x++)
                pixels[y * w + x] = (byte)((row[x * 3] + row[x * 3 + 1] + row[x * 3 + 2]) / 3);
        }
        bmp24.UnlockBits(bd);

        var img = new FingerprintImage(w, h, pixels,
            new FingerprintImageOptions { Dpi = 500 });
        return new FingerprintTemplate(img);
    }

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
            log.LogInformation("  uid={U} score={S:F1}", uid, score);
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
