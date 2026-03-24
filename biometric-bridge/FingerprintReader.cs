using System.Runtime.InteropServices;

namespace HybridBiometricBridge;

/// <summary>
/// Wrapper P/Invoke para el SDK nativo DigitalPersona U.are.U 4500.
/// Las DLLs deben estar en la carpeta libs/ junto al ejecutable.
/// </summary>
public sealed class FingerprintReader : IDisposable
{
    // ── Constantes SDK ────────────────────────────────────────────────────
    const int    DPFPDD_SUCCESS          = 0;
    const uint   DPFPDD_IMG_FMT_PIXEL_BUFFER = 0x01010000;
    const uint   DPFJ_FMD_ANSI_378_2004  = 0x001B0401;
    const uint   CAPTURE_TIMEOUT_MS      = 8000;
    const uint   IMAGE_RESOLUTION        = 500;
    const uint   QUALITY_THRESHOLD       = 50;

    // ── P/Invoke: dpfpdd.dll (device capture) ────────────────────────────
    [DllImport("dpfpdd.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int dpfpdd_init();

    [DllImport("dpfpdd.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int dpfpdd_exit();

    [DllImport("dpfpdd.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int dpfpdd_query_devices(out int deviceCount, IntPtr deviceList);

    [DllImport("dpfpdd.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int dpfpdd_open([MarshalAs(UnmanagedType.LPStr)] string deviceName, out IntPtr handle);

    [DllImport("dpfpdd.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int dpfpdd_close(IntPtr handle);

    [DllImport("dpfpdd.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int dpfpdd_capture(IntPtr handle, ref DpfpddCaptureParam param,
                                     uint timeout, uint size, IntPtr result);

    [DllImport("dpfpdd.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int dpfpdd_capture_abort(IntPtr handle);

    // ── P/Invoke: dpfj.dll (template extraction / matching) ──────────────
    [DllImport("dpfj.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int dpfj_create_fmd_from_fid(IntPtr fidData, uint fidSize,
                                                uint fmdType,
                                                IntPtr fmdData, ref uint fmdSize);

    [DllImport("dpfj.dll", CallingConvention = CallingConvention.Cdecl)]
    static extern int dpfj_compare(IntPtr fmd1, uint fmd1Size,
                                   uint fmd1ViewOffset,
                                   IntPtr fmd2, uint fmd2Size,
                                   uint fmd2ViewOffset,
                                   out uint score);

    // ── Structs SDK ───────────────────────────────────────────────────────
    [StructLayout(LayoutKind.Sequential)]
    struct DpfpddCaptureParam
    {
        public uint size;
        public uint imageResolution;
        public uint imageQualityThreshold;
    }

    // ── Estado interno ────────────────────────────────────────────────────
    private IntPtr _handle  = IntPtr.Zero;
    private bool   _inited  = false;
    private readonly ILogger<FingerprintReader> _log;

    public bool IsReady => _handle != IntPtr.Zero;

    public FingerprintReader(ILogger<FingerprintReader> log)
    {
        _log = log;
    }

    // ── Inicialización ────────────────────────────────────────────────────
    public bool Initialize()
    {
        int ret = dpfpdd_init();
        if (ret != DPFPDD_SUCCESS)
        {
            _log.LogError("dpfpdd_init falló: 0x{Ret:X}", ret);
            return false;
        }
        _inited = true;

        // Consultar dispositivos
        ret = dpfpdd_query_devices(out int count, IntPtr.Zero);
        if (ret != DPFPDD_SUCCESS || count == 0)
        {
            _log.LogError("No se encontró lector USB. Verifica la conexión.");
            return false;
        }

        // Obtener nombre del primer dispositivo
        int    deviceStructSize = 4096;
        IntPtr deviceBuf        = Marshal.AllocHGlobal(deviceStructSize * count);
        try
        {
            ret = dpfpdd_query_devices(out _, deviceBuf);
            if (ret != DPFPDD_SUCCESS) return false;
            string deviceName = Marshal.PtrToStringAnsi(deviceBuf) ?? "";
            _log.LogInformation("Lector encontrado: {Device}", deviceName);

            ret = dpfpdd_open(deviceName, out _handle);
            if (ret != DPFPDD_SUCCESS)
            {
                _log.LogError("No se pudo abrir el lector: 0x{Ret:X}", ret);
                return false;
            }
        }
        finally { Marshal.FreeHGlobal(deviceBuf); }

        _log.LogInformation("Lector inicializado correctamente.");
        return true;
    }

    // ── Captura + extracción de template ─────────────────────────────────
    /// <summary>
    /// Espera que el usuario coloque el dedo y devuelve el template Base64.
    /// Retorna null si falla o se cancela.
    /// </summary>
    public string? CaptureTemplate(CancellationToken ct = default)
    {
        if (!IsReady) return null;

        int    fidBufferSize = 500_000;
        IntPtr fidBuffer     = Marshal.AllocHGlobal(fidBufferSize);
        try
        {
            var param = new DpfpddCaptureParam
            {
                size                  = (uint)Marshal.SizeOf<DpfpddCaptureParam>(),
                imageResolution       = IMAGE_RESOLUTION,
                imageQualityThreshold = QUALITY_THRESHOLD
            };

            int ret = dpfpdd_capture(_handle, ref param, CAPTURE_TIMEOUT_MS,
                                     (uint)fidBufferSize, fidBuffer);

            if (ct.IsCancellationRequested && ret != DPFPDD_SUCCESS) return null;

            if (ret != DPFPDD_SUCCESS)
            {
                _log.LogWarning("Captura fallida o sin dedo en timeout: 0x{Ret:X}", ret);
                return null;
            }

            // FID → FMD
            uint   fmdSize   = 2048;
            IntPtr fmdBuffer = Marshal.AllocHGlobal((int)fmdSize);
            try
            {
                ret = dpfj_create_fmd_from_fid(fidBuffer, (uint)fidBufferSize,
                                               DPFJ_FMD_ANSI_378_2004,
                                               fmdBuffer, ref fmdSize);
                if (ret != DPFPDD_SUCCESS)
                {
                    _log.LogWarning("Extracción de template fallida: 0x{Ret:X}", ret);
                    return null;
                }

                byte[] fmdBytes = new byte[fmdSize];
                Marshal.Copy(fmdBuffer, fmdBytes, 0, (int)fmdSize);
                return Convert.ToBase64String(fmdBytes);
            }
            finally { Marshal.FreeHGlobal(fmdBuffer); }
        }
        finally { Marshal.FreeHGlobal(fidBuffer); }
    }

    public void AbortCapture()
    {
        if (IsReady) dpfpdd_capture_abort(_handle);
    }

    public void Dispose()
    {
        AbortCapture();
        if (_handle  != IntPtr.Zero) { dpfpdd_close(_handle); _handle = IntPtr.Zero; }
        if (_inited)                 { dpfpdd_exit(); _inited = false; }
    }
}
