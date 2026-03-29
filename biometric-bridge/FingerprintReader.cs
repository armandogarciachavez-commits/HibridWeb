using System.Windows.Forms;
using DPFP;
using DPFP.Capture;
using DPFP.Processing;

namespace HybridBiometricBridge;

public sealed class FingerprintReader : IDisposable, DPFP.Capture.EventHandler
{
    private Capture?  _capture;
    private Form?     _form;
    private Thread?   _staThread;
    private TaskCompletionSource<FeatureSet?>? _tcs;
    private DataPurpose _currentPurpose = DataPurpose.Verification;
    private readonly ILogger<FingerprintReader> _log;

    public bool IsReady => _capture != null;

    public FingerprintReader(ILogger<FingerprintReader> log)
    {
        _log = log;
    }

    public bool Initialize()
    {
        var ready   = new ManualResetEventSlim(false);
        var success = false;

        _staThread = new Thread(() =>
        {
            try
            {
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

                Application.Run(_form);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Error en hilo STA.");
                ready.Set();
            }
        });

        _staThread.SetApartmentState(ApartmentState.STA);
        _staThread.IsBackground = true;
        _staThread.Start();

        ready.Wait(TimeSpan.FromSeconds(10));
        return success;
    }

    /// <summary>Capture one FeatureSet for enrollment (Enrollment purpose).</summary>
    public Task<FeatureSet?> CaptureForEnrollmentAsync(CancellationToken ct = default)
        => CaptureInternalAsync(DataPurpose.Enrollment, ct);

    /// <summary>Capture one FeatureSet for identification (Verification purpose).</summary>
    public Task<FeatureSet?> CaptureForVerificationAsync(CancellationToken ct = default)
        => CaptureInternalAsync(DataPurpose.Verification, ct);

    private async Task<FeatureSet?> CaptureInternalAsync(DataPurpose purpose, CancellationToken ct)
    {
        if (_capture == null || _form == null) return null;

        _currentPurpose = purpose;
        _tcs = new TaskCompletionSource<FeatureSet?>();

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

    /// <summary>Runs Template.DeSerialize + Verification.Verify on the STA thread.</summary>
    public bool VerifyOnSta(FeatureSet features, byte[] templateBytes)
    {
        bool result = false;
        try
        {
            _form?.Invoke(() =>
            {
                try
                {
                    var template = new Template();
                    using var ms = new MemoryStream(templateBytes);
                    template.DeSerialize(ms);
                    _log.LogInformation("Template deserializado OK. Verificando...");

                    var verifier = new DPFP.Verification.Verification();
                    verifier.FARRequested = 10_000; // ~10% FAR para pruebas
                    var r = new DPFP.Verification.Verification.Result();
                    verifier.Verify(features, template, ref r);
                    _log.LogInformation("Verify result: {V}", r.Verified);
                    result = r.Verified;
                }
                catch (Exception ex)
                {
                    _log.LogError(ex, "Error en VerifyOnSta interno");
                    result = false;
                }
            });
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error en VerifyOnSta Invoke");
            result = false;
        }
        return result;
    }

    void DPFP.Capture.EventHandler.OnComplete(
        object Capture, string ReaderSerialNumber, DPFP.Sample sample)
    {
        try { _form?.Invoke(() => _capture?.StopCapture()); } catch { }
        try
        {
            var extractor = new FeatureExtraction();
            DPFP.Capture.CaptureFeedback feedback = DPFP.Capture.CaptureFeedback.None;
            var features = new FeatureSet();

            extractor.CreateFeatureSet(sample, _currentPurpose, ref feedback, ref features);

            if (feedback == DPFP.Capture.CaptureFeedback.Good)
            {
                _log.LogInformation("Muestra capturada ({Purpose}).", _currentPurpose);
                _tcs?.TrySetResult(features);
            }
            else
            {
                _log.LogWarning("Calidad insuficiente: {Feedback}", feedback);
                _tcs?.TrySetResult(null);
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error al procesar muestra.");
            _tcs?.TrySetResult(null);
        }
    }

    void DPFP.Capture.EventHandler.OnFingerTouch(object Capture, string ReaderSerialNumber)
        => _log.LogInformation("Dedo detectado.");

    void DPFP.Capture.EventHandler.OnFingerGone(object Capture, string ReaderSerialNumber) { }

    void DPFP.Capture.EventHandler.OnReaderConnect(object Capture, string ReaderSerialNumber)
        => _log.LogInformation("Lector conectado: {Serial}", ReaderSerialNumber);

    void DPFP.Capture.EventHandler.OnReaderDisconnect(object Capture, string ReaderSerialNumber)
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
