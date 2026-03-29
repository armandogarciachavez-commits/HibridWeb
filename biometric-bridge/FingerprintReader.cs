using System.Windows.Forms;
using DPFP;
using DPFP.Capture;
using DPFP.Processing;

namespace HybridBiometricBridge;

/// <summary>
/// Wrapper para el SDK managed de DigitalPersona (.NET).
/// Usa un Form oculto en hilo STA como ancla del message pump
/// (requerido por el SDK para recibir eventos USB del lector).
/// </summary>
public sealed class FingerprintReader : IDisposable, DPFP.Capture.EventHandler
{
    private Capture?  _capture;
    private Form?     _form;       // ancla del message pump STA
    private Thread?   _staThread;
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
        var ready   = new ManualResetEventSlim(false);
        var success = false;

        _staThread = new Thread(() =>
        {
            try
            {
                // Form oculto — provee el HWND que necesita el SDK
                _form = new Form
                {
                    Visible       = false,
                    ShowInTaskbar = false,
                    WindowState   = FormWindowState.Minimized
                };

                _form.Load += (_, _) =>
                {
                    try
                    {
                        _capture = new Capture(Priority.High);
                        _capture.EventHandler = this;
                        success = true;
                        _log.LogInformation("Lector DigitalPersona inicializado (STA).");
                    }
                    catch (Exception ex)
                    {
                        _log.LogError(ex, "Error al inicializar el lector.");
                    }
                    finally { ready.Set(); }
                };

                Application.Run(_form); // message pump STA
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Error en hilo STA del lector.");
                ready.Set();
            }
        });

        _staThread.SetApartmentState(ApartmentState.STA);
        _staThread.IsBackground = true;
        _staThread.Start();

        ready.Wait(TimeSpan.FromSeconds(10));
        return success;
    }

    // ── Captura async ─────────────────────────────────────────────────────
    public async Task<string?> CaptureTemplateAsync(CancellationToken ct = default)
    {
        if (_capture == null || _form == null) return null;

        _tcs = new TaskCompletionSource<string?>();

        // StartCapture DEBE ejecutarse en el hilo STA
        _form.Invoke(() => _capture.StartCapture());

        using var reg = ct.Register(() =>
        {
            try { _form?.Invoke(() => _capture?.StopCapture()); } catch { }
            _tcs?.TrySetResult(null);
        });

        return await _tcs.Task;
    }

    public void AbortCapture()
    {
        try { _form?.Invoke(() => _capture?.StopCapture()); } catch { }
        _tcs?.TrySetResult(null);
    }

    // ── DPFP.Capture.EventHandler ─────────────────────────────────────────
    void DPFP.Capture.EventHandler.OnComplete(
        object Capture, string ReaderSerialNumber, DPFP.Sample sample)
    {
        try { _form?.Invoke(() => _capture?.StopCapture()); } catch { }
        try
        {
            var extractor = new FeatureExtraction();
            DPFP.Capture.CaptureFeedback feedback = DPFP.Capture.CaptureFeedback.None;
            var features = new FeatureSet();

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
                _log.LogWarning("Calidad insuficiente: {Feedback}", feedback);
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
        try
        {
            if (_form != null && !_form.IsDisposed)
                _form.Invoke(Application.ExitThread);
        }
        catch { }
        _capture = null;
        _form    = null;
    }
}
