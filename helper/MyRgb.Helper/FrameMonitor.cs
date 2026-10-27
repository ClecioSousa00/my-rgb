using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Diagnostics.Tracing;
using Microsoft.Diagnostics.Tracing.Session;

namespace MyRgb.Helper;

public sealed record FrameStats(
    int ProcessId,
    string ProcessName,
    double Fps,
    double FrameTimeMs,
    double Low1Fps,
    IReadOnlyList<double> RecentFrameTimes);

/// <summary>
/// Measures the FPS of any process without injecting code, like PresentMon: it
/// listens over ETW for the "Present" events Windows emits for every frame sent
/// through DXGI (DirectX 10/11/12) and Direct3D 9. Vulkan/OpenGL games only show
/// up when they present through DXGI (common on recent drivers, not guaranteed).
///
/// Requires an elevated process: ETW sessions are machine-wide.
/// </summary>
public sealed class FrameMonitor : IDisposable
{
    private const string SessionName = "MyRgb-Helper-Frames";
    private static readonly Guid DxgiProvider = new("CA11C036-0102-4A2D-A6AD-F03CFED5D3C9");
    private static readonly Guid D3D9Provider = new("783ACA0A-790E-4D7F-8451-AA850511C6B9");
    private const int DxgiPresentStart = 42, D3D9PresentStart = 1;

    /// <summary>Window used for the 1% low and for the recent frame times.</summary>
    private const double HistoryMs = 10_000;

    private TraceEventSession? _session;
    private Thread? _thread;
    private readonly object _lock = new();
    private readonly Dictionary<int, Queue<double>> _presents = new(); // pid -> timestamps (ms, ETW clock)
    private readonly Dictionary<int, long> _lastSeen = new();           // pid -> Stopwatch of the last event

    public bool Running => _thread?.IsAlive == true;
    public string? Error { get; private set; }

    public void Start()
    {
        if (Running) return;
        try
        {
            // Create takes over a stale session with the same name (a helper that
            // was killed instead of asked to exit).
            _session = new TraceEventSession(SessionName, TraceEventSessionOptions.Create)
            {
                StopOnDispose = true
            };
            _session.EnableProvider(DxgiProvider, TraceEventLevel.Informational, ulong.MaxValue, null);
            _session.EnableProvider(D3D9Provider, TraceEventLevel.Informational, ulong.MaxValue, null);
            _session.Source.AllEvents += OnEvent;
            _thread = new Thread(() =>
            {
                try { _session.Source.Process(); }
                catch (Exception ex) { Error = ex.Message; }
            })
            {
                IsBackground = true,
                Name = "ETW frames"
            };
            _thread.Start();
            Error = null;
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            _session?.Dispose();
            _session = null;
        }
    }

    private void OnEvent(TraceEvent e)
    {
        int id = (int)e.ID;
        bool present = (e.ProviderGuid == DxgiProvider && id == DxgiPresentStart) ||
                       (e.ProviderGuid == D3D9Provider && id == D3D9PresentStart);
        if (!present) return;

        double t = e.TimeStampRelativeMSec;
        lock (_lock)
        {
            if (!_presents.TryGetValue(e.ProcessID, out var queue))
                _presents[e.ProcessID] = queue = new Queue<double>();
            queue.Enqueue(t);
            while (queue.Count > 0 && queue.Peek() < t - HistoryMs) queue.Dequeue();
            _lastSeen[e.ProcessID] = Stopwatch.GetTimestamp();
        }
    }

    /// <summary>The process stats, or null when it presented no frames in the last 2 s.</summary>
    public FrameStats? GetStats(int pid)
    {
        double[] ts;
        lock (_lock)
        {
            if (!_presents.TryGetValue(pid, out var queue) || queue.Count < 3) return null;
            if (Stopwatch.GetElapsedTime(_lastSeen[pid]).TotalSeconds > 2) return null;
            ts = queue.ToArray();
        }

        double last = ts[^1];
        var frameTimes = new List<double>(ts.Length);
        for (int i = 1; i < ts.Length; i++) frameTimes.Add(ts[i] - ts[i - 1]);

        // FPS of the last second, from the event clock: immune to ETW delivery lag.
        int first = Array.FindIndex(ts, x => x >= last - 1000);
        double span = last - ts[first];
        int frames = ts.Length - 1 - first;
        double fps = span > 0 ? frames * 1000 / span : 0;

        // 1% low: FPS equivalent to the 99th percentile of the frame time in 10 s.
        var sorted = frameTimes.OrderBy(x => x).ToArray();
        double p99 = sorted[(int)Math.Min(sorted.Length - 1, Math.Floor(sorted.Length * 0.99))];
        double low1 = p99 > 0 ? 1000 / p99 : 0;

        var recent = frameTimes.Skip(Math.Max(0, frameTimes.Count - 120)).ToList();
        return new FrameStats(
            pid,
            ProcessName(pid),
            Math.Round(fps, 1),
            Math.Round(fps > 0 ? 1000 / fps : 0, 2),
            Math.Round(low1, 1),
            recent.Select(value => Math.Round(value, 2)).ToList());
    }

    /// <summary>Stats for the program in the foreground (the game on screen).</summary>
    public FrameStats? GetForegroundStats()
    {
        var hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return null;
        GetWindowThreadProcessId(hwnd, out uint pid);
        return pid == 0 || pid == Environment.ProcessId ? null : GetStats((int)pid);
    }

    private static string ProcessName(int pid)
    {
        try { return Process.GetProcessById(pid).ProcessName; }
        catch { return $"PID {pid}"; }
    }

    public void Dispose()
    {
        try { _session?.Source.StopProcessing(); } catch { }
        _session?.Dispose();
        _session = null;
        _thread = null;
    }

    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
