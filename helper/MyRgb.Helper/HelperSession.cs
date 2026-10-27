using System.Security.Principal;
using System.Text.Json.Nodes;

namespace MyRgb.Helper;

/// <summary>
/// The commands exposed over the pipe. Every one returns plain objects that
/// the TypeScript side deserializes; `fps.poll` returns null when no game is
/// presenting, which is a normal answer (a menu, the desktop).
///
/// Only FPS lives here. Temperatures and fans still come from the shared
/// sensor collector in the main app, so this helper stays small and needs one
/// UAC prompt for one purpose.
/// </summary>
internal sealed class HelperSession : IDisposable
{
    private readonly FrameMonitor _monitor = new();
    private readonly bool _elevated = IsElevated();

    public object? Dispatch(string cmd, JsonNode? args) => cmd switch
    {
        "ping" => new
        {
            pong = true,
            version = Program.Version,
            elevated = _elevated,
            running = _monitor.Running
        },
        "fps.start" => StartFps(),
        "fps.stop" => StopFps(),
        "fps.poll" => PollFps(),
        "fps.status" => Status(),
        _ => throw new InvalidOperationException($"Comando desconhecido: {cmd}")
    };

    private object StartFps()
    {
        if (!_elevated)
        {
            throw new InvalidOperationException(
                "O helper precisa ser executado como administrador para ler os eventos de frame do Windows.");
        }

        _monitor.Start();
        if (!_monitor.Running)
        {
            throw new InvalidOperationException(
                _monitor.Error ?? "O Windows não permitiu abrir a sessão de eventos de frame.");
        }

        return new { running = true };
    }

    private object StopFps()
    {
        _monitor.Dispose();
        return new { running = false };
    }

    private object? PollFps()
    {
        if (!_monitor.Running)
        {
            // A dead ETW thread would otherwise look like "no game" forever.
            throw new InvalidOperationException(_monitor.Error ?? "A captura de frames não está ativa.");
        }

        var stats = _monitor.GetForegroundStats();
        if (stats is null) return null;

        return new
        {
            pid = stats.ProcessId,
            process = stats.ProcessName,
            fps = stats.Fps,
            frameTimeMs = stats.FrameTimeMs,
            low1Fps = stats.Low1Fps,
            recent = stats.RecentFrameTimes
        };
    }

    private object Status() => new
    {
        running = _monitor.Running,
        error = _monitor.Error,
        elevated = _elevated
    };

    public void Dispose() => _monitor.Dispose();

    private static bool IsElevated()
    {
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }
}
