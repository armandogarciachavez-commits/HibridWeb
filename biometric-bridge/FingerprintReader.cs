using System.Drawing;
using System.Drawing.Imaging;
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
    private TaskCompletionSource<byte[]?>? _tcs;
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

    /// <summary>Captura una imagen de huella y la devuelve como PNG (bytes).</summary>
    public Task<byte[]?> CaptureImageAsync(CancellationToken ct = default)
    {
        if (_capture == null || _form == null) return Task.FromResult<byte[]?>(null);

        _tcs = new TaskCompletionSource<byte[]?>();
        _form.Invoke(() => _capture.StartCapture());

        var reg = ct.Register(() =>
        {
            try { _form?.Invoke(() => _capture?.StopCapture()); } catch { }
            _tcs?.TrySetResult(null);
        });

        return _tcs.Task.ContinueWith(t => { reg.Dispose(); return t.Result; });
    }

    public void AbortCapture()
    {
        try { _form?.Invoke(() => _capture?.StopCapture()); } catch { }
        _tcs?.TrySetResult(null);
    }

    // ── Conversión de Sample a PNG ───────────────────────────────────────
    private byte[]? SampleToPng(DPFP.Sample sample)
    {
        try
        {
            Bitmap? bmp = null;

            // Busca SampleConversion en los ensamblados cargados (DPFP.Capture o DPFP.Misc)
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = asm.GetType("DPFP.Capture.SampleConversion")
                     ?? asm.GetType("DPFP.Misc.SampleConversion");
                if (t == null) continue;

                try
                {
                    var inst   = Activator.CreateInstance(t);
                    var method = t.GetMethod("ConvertToBitmap");
                    if (method != null)
                    {
                        var args = new object?[] { sample, null };
                        method.Invoke(inst, args);
                        bmp = args[1] as Bitmap;
                    }
                }
                catch { }
                break;
            }

            if (bmp == null)
            {
                _log.LogWarning("SampleConversion no disponible; intentando parseo directo.");
                bmp = SampleToGrayscaleBitmap(sample);
            }

            if (bmp == null)
            {
                _log.LogError("No se pudo obtener imagen del sample.");
                return null;
            }

            using var ms = new MemoryStream();
            bmp.Save(ms, ImageFormat.Png);
            _log.LogInformation("Imagen de huella: {W}x{H}px ({KB}KB)",
                bmp.Width, bmp.Height, ms.Length / 1024);
            return ms.ToArray();
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error en SampleToPng");
            return null;
        }
    }

    /// <summary>
    /// Parseo directo del Sample serializado de DigitalPersona.
    /// Formato: [version:4][reserved:4][width:4][height:4][dpi:4][depth:4][dataSize:4][pixels:n]
    /// </summary>
    private Bitmap? SampleToGrayscaleBitmap(DPFP.Sample sample)
    {
        try
        {
            using var ms = new MemoryStream();
            sample.Serialize(ms);
            var b = ms.ToArray();

            _log.LogDebug("Sample raw {Len}b, header: {H}",
                b.Length, string.Join(" ", b.Take(32).Select(x => x.ToString("X2"))));

            // Intenta encontrar dimensiones válidas en las primeras posiciones del header
            for (int off = 0; off + 12 <= b.Length; off += 4)
            {
                int w = BitConverter.ToInt32(b, off);
                int h = BitConverter.ToInt32(b, off + 4);
                if (w < 100 || w > 1000 || h < 100 || h > 1000) continue;

                int dataSize = w * h;
                int dataOff  = off + 8;
                if (b.Length < dataOff + dataSize) continue;

                var pixels = new byte[dataSize];
                Array.Copy(b, dataOff, pixels, 0, dataSize);

                var bmp = new Bitmap(w, h, PixelFormat.Format8bppIndexed);
                var pal = bmp.Palette;
                for (int i = 0; i < 256; i++)
                    pal.Entries[i] = Color.FromArgb(i, i, i);
                bmp.Palette = pal;

                var bd = bmp.LockBits(new Rectangle(0, 0, w, h),
                    ImageLockMode.WriteOnly, PixelFormat.Format8bppIndexed);
                System.Runtime.InteropServices.Marshal.Copy(pixels, 0, bd.Scan0, dataSize);
                bmp.UnlockBits(bd);

                _log.LogInformation("Imagen parseada: offset={Off} {W}x{H}", off, w, h);
                return bmp;
            }
        }
        catch (Exception ex) { _log.LogError(ex, "SampleToGrayscaleBitmap falló"); }
        return null;
    }

    // ── DPFP event handlers ───────────────────────────────────────────────
    void DPFP.Capture.EventHandler.OnComplete(
        object Capture, string ReaderSerialNumber, DPFP.Sample sample)
    {
        try { _form?.Invoke(() => _capture?.StopCapture()); } catch { }
        try
        {
            // Validar calidad usando FeatureExtraction
            var extractor = new FeatureExtraction();
            var feedback  = DPFP.Capture.CaptureFeedback.None;
            var features  = new FeatureSet();
            extractor.CreateFeatureSet(sample, DataPurpose.Verification,
                ref feedback, ref features);

            if (feedback != DPFP.Capture.CaptureFeedback.Good)
            {
                _log.LogWarning("Calidad insuficiente: {F}", feedback);
                _tcs?.TrySetResult(null);
                return;
            }

            _log.LogInformation("Muestra capturada OK.");
            var png = SampleToPng(sample);
            _tcs?.TrySetResult(png);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error en OnComplete");
            _tcs?.TrySetResult(null);
        }
    }

    void DPFP.Capture.EventHandler.OnFingerTouch(object Capture, string ReaderSerialNumber)
        => _log.LogInformation("Dedo detectado.");

    void DPFP.Capture.EventHandler.OnFingerGone(object Capture, string ReaderSerialNumber) { }

    void DPFP.Capture.EventHandler.OnReaderConnect(object Capture, string ReaderSerialNumber)
        => _log.LogInformation("Lector conectado: {S}", ReaderSerialNumber);

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
