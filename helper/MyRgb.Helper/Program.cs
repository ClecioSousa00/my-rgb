using System.Diagnostics;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MyRgb.Helper;

/// <summary>
/// Small, elevated sidecar that reads frame times from ETW.
///
/// Electron does not run as administrator and must not, so the main app starts
/// this executable on demand with a UAC prompt and talks to it over a local
/// named pipe. The wire format is one JSON object per line, in both directions:
///
///   {"id":1,"cmd":"fps.poll"}                 ->
///   {"id":1,"ok":true,"result":{...}}
///   {"id":2,"cmd":"fps.start"}                ->
///   {"id":2,"ok":false,"error":"..."}
///
/// The helper can also be used by hand with no arguments (stdio), which is how
/// it is debugged without Electron.
/// </summary>
internal static class Program
{
    internal const string Version = "0.1.0";

    private static int Main(string[] args)
    {
        var pipe = ArgValue(args, "--pipe");
        var parent = int.TryParse(ArgValue(args, "--parent"), out int pid) && pid > 0 ? pid : 0;

        using var session = new HelperSession();
        if (parent > 0) WatchParent(parent);

        try
        {
            if (pipe is not null) RunPipe(session, pipe);
            else RunStdio(session);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"myrgb-helper: {ex.Message}");
            return 1;
        }
    }

    /// <summary>One request per line on stdin, one reply per line on stdout.</summary>
    private static void RunStdio(HelperSession session)
    {
        var encoding = new UTF8Encoding(false);
        using var input = new StreamReader(Console.OpenStandardInput(), encoding);
        using var output = new StreamWriter(Console.OpenStandardOutput(), encoding)
        {
            AutoFlush = true,
            NewLine = "\n"
        };
        Serve(session, input, output);
    }

    /// <summary>
    /// Elevated processes do not inherit the parent's stdio, so the packaged
    /// path is a named pipe. Electron creates the server; we connect as a
    /// client, which is the direction Windows allows across integrity levels.
    /// </summary>
    private static void RunPipe(HelperSession session, string pipeName)
    {
        using var client = new NamedPipeClientStream(
            ".", pipeName, PipeDirection.InOut, PipeOptions.None, TokenImpersonationLevel.None);
        client.Connect(30_000);

        var encoding = new UTF8Encoding(false);
        using var input = new StreamReader(client, encoding);
        using var output = new StreamWriter(client, encoding)
        {
            AutoFlush = true,
            NewLine = "\n"
        };
        Serve(session, input, output);
    }

    private static void Serve(HelperSession session, TextReader input, TextWriter output)
    {
        string? line;
        while ((line = input.ReadLine()) is not null)
        {
            line = line.Trim();
            if (line.Length == 0) continue;

            long id = -1;
            JsonNode? args = null;
            string cmd;
            try
            {
                if (JsonNode.Parse(line) is not JsonObject request)
                {
                    output.WriteLine(Reply(id, false, null, "Pedido inválido."));
                    continue;
                }
                id = request["id"]?.GetValue<long>() ?? -1;
                cmd = request["cmd"]?.GetValue<string>() ?? string.Empty;
                args = request["args"];
            }
            catch (Exception ex)
            {
                output.WriteLine(Reply(id, false, null, $"Pedido inválido: {ex.Message}"));
                continue;
            }

            if (cmd == "shutdown")
            {
                output.WriteLine(Reply(id, true, new { stopped = true }, null));
                return;
            }

            try
            {
                var result = session.Dispatch(cmd, args);
                output.WriteLine(Reply(id, true, result, null));
            }
            catch (Exception ex)
            {
                // A refused command is a reply, not a crash: the app turns it
                // into the reason shown on the Overlay page.
                output.WriteLine(Reply(id, false, null, ex.Message));
            }
        }
    }

    private static string Reply(long id, bool ok, object? result, string? error) =>
        JsonSerializer.Serialize(new { id, ok, result, error });

    /// <summary>Exit when the app that started us dies, even if the pipe stays open.</summary>
    private static void WatchParent(int pid)
    {
        var thread = new Thread(() =>
        {
            try
            {
                using var parent = Process.GetProcessById(pid);
                parent.WaitForExit();
            }
            catch
            {
                // Already gone, or the PID was never valid.
            }
            Environment.Exit(0);
        })
        {
            IsBackground = true,
            Name = "parent watch"
        };
        thread.Start();
    }

    private static string? ArgValue(string[] args, string name)
    {
        int index = Array.IndexOf(args, name);
        return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
    }
}
