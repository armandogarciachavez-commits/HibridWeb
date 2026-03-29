using DPFP;
using DPFP.Capture;
using DPFP.Processing;

namespace HybridBiometricBridge;

/// <summary>
/// Wrapper para el SDK managed de DigitalPersona (.NET).
/// Requiere DPFPDevNET.dll y DPFPEngNET.dll en libs/.
/// </summary>
public sealed class FingerprintReader : IDisposable, DPFP.Capture.EventHandler
{
    private Capture?  _capture;
    private TaskCompletionSource<string?>? _tcs;
    private readonly ILogger<FingerprintReader> _log;

    public bool IsReady => _capture != null;

    public FingerprintReader(ILogger<FingerprintReader> log)
    {
        _log = log;
    }

    // ── Inicialización ────────────────────────────────────────────────────
    public bool Initialize()
    {
        try
        {
            _capture = new Capture(Priority.High);
            _capture.EventHandler = this;
            _log.LogInformation("Lector DigitalPersona inicializado (managed SDK).");
            return true;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error al inicializar el lector. Verifica que esté conectado.");
            return false;
        }
    }

    // ── Captura async ─────────────────────────────────────────────────────
    /// <summary>
    /// Espera que el usuario coloque el dedo y devuelve el template en Base64.
    /// Devuelve null si falla o se cancela.
    /// </summary>
    public async Task<string?> CaptureTemplateAsync(CancellationToken ct = default)
    {
        if (_capture == null) return null;

        _tcs = new TaskCompletionSource<string?>();
        _capture.StartCapture();

        using var reg = ct.Register(() =>
        {
            _capture?.StopCapture();
            _tcs?.TrySetResult(null);
        });

        return await _tcs.Task;
    }

    public void AbortCapture()
    {
        _capture?.StopCapture();
        _tcs?.TrySetResult(null);
    }

    // ── DPFP.Capture.EventHandler ─────────────────────────────────────────
    void DPFP.Capture.EventHandler.OnComplete(
        object Capture, string ReaderSerialNumber, DPFP.Sample sample)
    {
        _capture?.StopCapture();
        try
        {
            var extractor = new FeatureExtraction();
            DPFP.Capture.CaptureFeedback feedback = DPFP.Capture.CaptureFeedback.None;
            var features  = new FeatureSet();

            // Intentar enrollment primero, luego verification
            extractor.CreateFeatureSet(sample, DataPurpose.Enrollment,
                                       ref feedback, ref features);
            if (feedback != DPFP.Capture.CaptureFeedback.Good)
                extractor.CreateFeatureSet(sample, DataPurpose.Verification,
                                           ref feedback, ref features);

            if (feedback == DPFP.Capture.CaptureFeedback.Good)
            {
                using var ms = new MemoryStream();
                features.Serialize(ms);
                _log.LogInformation("Huella capturada correctamente.");
                _tcs?.TrySetResult(Convert.ToBase64String(ms.ToArray()));
            }
            else
            {
                _log.LogWarning("Calidad de huella insuficiente: {Feedback}", feedback);
                _tcs?.TrySetResult(null);
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error al procesar la huella.");
            _tcs?.TrySetResult(null);
        }
    }

    void DPFP.Capture.EventHandler.OnFingerTouch(
        object Capture, string ReaderSerialNumber)
        => _log.LogInformation("Dedo detectado en el lector.");

    void DPFP.Capture.EventHandler.OnFingerGone(
        object Capture, string ReaderSerialNumber) { }

    void DPFP.Capture.EventHandler.OnReaderConnect(
        object Capture, string ReaderSerialNumber)
        => _log.LogInformation("Lector conectado: {Serial}", ReaderSerialNumber);

    void DPFP.Capture.EventHandler.OnReaderDisconnect(
        object Capture, string ReaderSerialNumber)
    {
        _log.LogWarning("Lector desconectado.");
        _tcs?.TrySetResult(null);
    }

    void DPFP.Capture.EventHandler.OnSampleQuality(
        object Capture, string ReaderSerialNumber,
        DPFP.Capture.CaptureFeedback CaptureFeedback) { }

    public void Dispose()
    {
        AbortCapture();
        _capture = null;
    }
}
