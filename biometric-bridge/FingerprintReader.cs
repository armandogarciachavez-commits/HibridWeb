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
    private DPFP.Verification.Verification? _verifier;

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
                        _verifier = new DPFP.Verification.Verification();
                        _verifier.FARRequested = 100; // 0.1% FAR
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

        // Serialize the FeatureSet on the calling thread so it can be safely
        // reconstructed on the STA thread (avoids COM apartment boundary issues).
        byte[] featuresBytes;
        try
        {
            using var msF = new MemoryStream();
            features.Serialize(msF);
            featuresBytes = msF.ToArray();
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "VerifyOnSta: no se pudo serializar FeatureSet");
            return false;
        }

        _log.LogInformation(
            "VerifyOnSta: features={FB}b template={TB}b form={F} verifier={V}",
            featuresBytes.Length, templateBytes.Length,
            _form is null ? "NULL" : "OK",
            _verifier is null ? "NULL" : "OK");

        if (_form is null || _verifier is null) return false;

        try
        {
            _form.Invoke(() =>
            {
                try
                {
                    // Reconstruct both objects fresh on the STA thread
                    var featureSet = new FeatureSet();
                    using var msF = new MemoryStream(featuresBytes);
                    featureSet.DeSerialize(msF);

                    var template = new Template();
                    using var msT = new MemoryStream(templateBytes);
                    template.DeSerialize(msT);

                    _log.LogInformation("VerifyOnSta STA: objetos deserializados, llamando Verify...");
                    var r = new DPFP.Verification.Verification.Result();
                    _verifier!.Verify(featureSet, template, ref r);
                    _log.LogInformation("VerifyOnSta STA: Verified={V}", r.Verified);
                    result = r.Verified;
                }
                catch (Exception ex)
                {
                    _log.LogError(ex, "VerifyOnSta STA error interno: {Msg}", ex.Message);
                    result = false;
                }
            });
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "VerifyOnSta Invoke error: {Msg}", ex.Message);
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
