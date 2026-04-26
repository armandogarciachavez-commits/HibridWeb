using System.Text.Json;

namespace HybridBiometricBridge;

/// <summary>Datos de un socio guardados localmente para acceso offline.</summary>
public sealed record CachedMember(
    int     Id,
    string  Name,
    string? PhotoUrl,
    string  Role,
    bool    HasActiveMembership,
    int     DaysLeft,
    string? EndDate);

/// <summary>Scan registrado mientras no había internet, pendiente de sincronizar.</summary>
public sealed record PendingScan(
    int      UserId,
    DateTime ScannedAt,
    string   Status);

/// <summary>
/// Persiste en disco tres archivos JSON:
///   templates.json   — huellas (userId → base64)
///   members.json     — socios  (nombre, foto, membresía)
///   scan_queue.json  — scans pendientes de sincronizar con la API
///
/// Directorio: %LocalAppData%\HybridBridge\cache\
/// </summary>
public sealed class LocalCache
{
    private readonly string              _dir;
    private readonly ILogger<LocalCache> _log;

    // Espejos en memoria (lectura rápida sin I/O)
    private readonly object            _membersLock = new();
    private          List<CachedMember> _members    = [];

    private readonly object         _queueLock = new();
    private          List<PendingScan> _queue   = [];

    private string TemplatesPath => Path.Combine(_dir, "templates.json");
    private string MembersPath   => Path.Combine(_dir, "members.json");
    private string QueuePath     => Path.Combine(_dir, "scan_queue.json");

    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = false };

    public LocalCache(ILogger<LocalCache> log)
    {
        _log = log;
        _dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "HybridBridge", "cache");
        Directory.CreateDirectory(_dir);
        _log.LogInformation("LocalCache directorio: {D}", _dir);
        LoadQueue();   // recuperar cola pendiente de sesiones anteriores
    }

    // ── Templates ─────────────────────────────────────────────────────────

    public void SaveTemplates(List<(int UserId, string TemplateBase64)> templates)
    {
        try
        {
            var dict = templates.ToDictionary(
                t => t.UserId.ToString(),
                t => t.TemplateBase64);
            File.WriteAllText(TemplatesPath, JsonSerializer.Serialize(dict, JsonOpts));
            _log.LogInformation("Cache: {N} templates guardados en disco.", dict.Count);
        }
        catch (Exception ex) { _log.LogError(ex, "Error guardando templates en cache."); }
    }

    public List<(int UserId, string TemplateBase64)> LoadTemplates()
    {
        try
        {
            if (!File.Exists(TemplatesPath)) return [];
            var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(
                File.ReadAllText(TemplatesPath)) ?? [];
            _log.LogInformation("Cache: {N} templates cargados del disco.", dict.Count);
            return dict.Select(kv => (int.Parse(kv.Key), kv.Value)).ToList();
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error cargando templates del cache.");
            return [];
        }
    }

    // ── Members ────────────────────────────────────────────────────────────

    public void SaveMembers(List<CachedMember> members)
    {
        lock (_membersLock) { _members = members; }
        try
        {
            File.WriteAllText(MembersPath, JsonSerializer.Serialize(members, JsonOpts));
            _log.LogInformation("Cache: {N} socios guardados en disco.", members.Count);
        }
        catch (Exception ex) { _log.LogError(ex, "Error guardando socios en cache."); }
    }

    public List<CachedMember> LoadMembers()
    {
        try
        {
            if (!File.Exists(MembersPath)) return [];
            var members = JsonSerializer.Deserialize<List<CachedMember>>(
                File.ReadAllText(MembersPath)) ?? [];
            lock (_membersLock) { _members = members; }
            _log.LogInformation("Cache: {N} socios cargados del disco.", members.Count);
            return members;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error cargando socios del cache.");
            return [];
        }
    }

    public CachedMember? GetMember(int userId)
    {
        lock (_membersLock) { return _members.FirstOrDefault(m => m.Id == userId); }
    }

    public int MemberCount { get { lock (_membersLock) return _members.Count; } }

    public List<CachedMember> GetAllMembers()
    {
        lock (_membersLock) { return [.. _members]; }
    }

    public List<CachedMember> SearchMembers(string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return [];
        var q = query.Trim().ToLowerInvariant();
        lock (_membersLock)
        {
            return _members
                .Where(m => m.Name.ToLowerInvariant().Contains(q))
                .Take(8)
                .ToList();
        }
    }

    // ── Scan Queue ─────────────────────────────────────────────────────────

    public void EnqueueScan(PendingScan scan)
    {
        lock (_queueLock)
        {
            _queue.Add(scan);
            PersistQueue();
        }
        _log.LogWarning("Scan encolado (offline): user_id={U}, status={S}",
            scan.UserId, scan.Status);
    }

    /// <summary>Retorna todos los scans pendientes y vacía la cola.</summary>
    public List<PendingScan> DrainQueue()
    {
        lock (_queueLock)
        {
            if (_queue.Count == 0) return [];
            var items = _queue.ToList();
            _queue.Clear();
            PersistQueue();
            return items;
        }
    }

    public int QueueCount { get { lock (_queueLock) return _queue.Count; } }

    // ── Privados ───────────────────────────────────────────────────────────

    private void LoadQueue()
    {
        try
        {
            if (!File.Exists(QueuePath)) return;
            var q = JsonSerializer.Deserialize<List<PendingScan>>(
                File.ReadAllText(QueuePath)) ?? [];
            lock (_queueLock) { _queue = q; }
            if (_queue.Count > 0)
                _log.LogWarning("Cache: {N} scans pendientes de sincronizar al arrancar.",
                    _queue.Count);
        }
        catch (Exception ex) { _log.LogError(ex, "Error cargando cola del cache."); }
    }

    private void PersistQueue()   // llamar dentro de _queueLock
    {
        try { File.WriteAllText(QueuePath, JsonSerializer.Serialize(_queue, JsonOpts)); }
        catch (Exception ex) { _log.LogError(ex, "PersistQueue: no se pudo guardar la cola en disco ({N} scans en memoria).", _queue.Count); }
    }
}
