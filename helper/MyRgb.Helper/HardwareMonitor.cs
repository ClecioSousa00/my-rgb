using System;
using System.Collections.Generic;
using System.Linq;
using LibreHardwareMonitor.Hardware;

namespace MyRgb.Helper;

/// <summary>Where a sensor reading comes from, for grouping order.</summary>
public enum SensorGroup
{
    cpu, gpu, board, ram, storage, network, other
}

/// <summary>What a sensor measures.</summary>
public enum SensorKind
{
    temperature, load, clock, power, voltage, fan, memory
}

/// <summary>
/// Reads board temperatures, fan speeds, pump speeds, clocks, loads and
/// voltages on Windows through LibreHardwareMonitorLib (WMI/SMBIOS).
///
/// Every reading is tagged with the hardware it came from (`chip`) and the
/// group (`cpu`, `gpu`, `board`, `ram`, `storage`, `network`, `other`), so the
/// TypeScript side can group and sort exactly like the hwmon collector on Linux.
/// </summary>
public sealed class HardwareMonitor : IDisposable
{
    private readonly Computer _computer;
    private bool _disposed;

    public HardwareMonitor()
    {
        // Enable every sensor class LibreHardwareMonitor can expose; each one
        // is opened lazily and a missing class just reports nothing.
        _computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = true,
            IsMotherboardEnabled = true,
            IsControllerEnabled = true,
            IsNetworkEnabled = true,
            IsStorageEnabled = true,
            IsPsuEnabled = true,
        };
        _computer.Open();
    }

    /// <summary>One JSON-serialisable snapshot of every sensor value.</summary>
    public IReadOnlyList<SensorReading> Read()
    {
        var readings = new List<SensorReading>();
        int order = 0;

        foreach (var hardware in _computer.Hardware)
        {
            hardware.Update();
            var (group, chip) = DescribeHardware(hardware);

            foreach (var sensor in hardware.Sensors)
            {
                if (sensor.Value is not float value || float.IsNaN(value)) continue;
                if (!TryMapKind(sensor.SensorType, out var kind)) continue;
                if (!Plausible(kind, value)) continue;

                var label = sensor.Name ?? sensor.SensorType.ToString() ?? string.Empty;
                var role = kind == SensorKind.fan && IsPump(label) ? "pump" : null;

                readings.Add(new SensorReading(
                    $"{hardware.Name}:{sensor.Name}",
                    kind.ToString(),
                    group.ToString(),
                    chip,
                    label,
                    Round(kind, value),
                    UnitOf(kind),
                    order++,
                    null,
                    role,
                    null,
                    null,
                    null
                ));
            }

            // Sub-hardware (e.g. a GPU's memory controller) gets its own chip.
            foreach (var sub in hardware.SubHardware)
            {
                sub.Update();
                var (subGroup, subChip) = DescribeHardware(sub, parent: chip);

                foreach (var sensor in sub.Sensors)
                {
                    if (sensor.Value is not float value || float.IsNaN(value)) continue;
                    if (!TryMapKind(sensor.SensorType, out var kind)) continue;
                    if (!Plausible(kind, value)) continue;

                    var label = sensor.Name ?? sensor.SensorType.ToString() ?? string.Empty;
                    readings.Add(new SensorReading(
                        $"{hardware.Name}/{sub.Name}:{sensor.Name}",
                        kind.ToString(),
                        subGroup.ToString(),
                        subChip,
                        label,
                        Round(kind, value),
                        UnitOf(kind),
                        order++,
                        null,
                        kind == SensorKind.fan && IsPump(label) ? "pump" : null,
                        null,
                        null,
                        null
                    ));
                }
            }
        }

        return readings;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try { _computer.Close(); } catch { }
    }

    // ------------------------------------------------------------------
    // Mapping from LibreHardwareMonitor to the shared sensor model.

    static (SensorGroup group, string chip) DescribeHardware(IHardware hardware, string? parent = null)
    {
        var name = hardware.Name ?? string.Empty;
        var chip = parent is not null ? $"{parent} · {name}" : name;

        var type = hardware.HardwareType switch
        {
            HardwareType.Cpu => SensorGroup.cpu,
            HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel => SensorGroup.gpu,
            HardwareType.Motherboard => SensorGroup.board,
            HardwareType.Memory => SensorGroup.ram,
            HardwareType.Storage => SensorGroup.storage,
            HardwareType.Network => SensorGroup.network,
            _ => SensorGroup.other
        };

        return (type, chip);
    }

    static SensorKind MapKind(SensorType type) => type switch
    {
        SensorType.Temperature => SensorKind.temperature,
        SensorType.Load => SensorKind.load,
        SensorType.Clock => SensorKind.clock,
        SensorType.Fan => SensorKind.fan,
        SensorType.Voltage => SensorKind.voltage,
        SensorType.Power => SensorKind.power,
        SensorType.Data => SensorKind.memory,
        _ => throw new ArgumentOutOfRangeException(nameof(type))
    };

    static bool TryMapKind(SensorType type, out SensorKind kind)
    {
        try
        {
            kind = MapKind(type);
            return true;
        }
        catch
        {
            kind = default;
            return false;
        }
    }

    static string UnitOf(SensorKind kind) => kind switch
    {
        SensorKind.temperature => "°C",
        SensorKind.fan => "RPM",
        SensorKind.voltage => "V",
        SensorKind.power => "W",
        SensorKind.clock => "MHz",
        SensorKind.memory => "GB",
        _ => ""
    };

    static double Round(SensorKind kind, double value)
    {
        var digits = kind switch
        {
            SensorKind.temperature => 1,
            SensorKind.voltage => 3,
            SensorKind.power => 2,
            _ => 0
        };
        var factor = Math.Pow(10, digits);
        return Math.Round(value * factor) / factor;
    }

    static bool Plausible(SensorKind kind, double value) => kind switch
    {
        SensorKind.temperature => value > 0 && value < 150,
        SensorKind.fan => value >= 0 && value < 20_000,
        SensorKind.voltage => value > 0 && value < 50,
        SensorKind.power => value > 0 && value < 2_000,
        SensorKind.clock => value > 0 && value < 20_000,
        SensorKind.memory => value >= 0 && value < 1_000_000,
        _ => true
    };

    static bool IsPump(string label)
    {
        if (string.IsNullOrEmpty(label)) return false;
        var lower = label.ToLowerInvariant();
        return lower.Contains("pump") || lower.Contains("bomba");
    }
}

/// <summary>One sensor reading, serialisable to JSON for the pipe protocol.</summary>
public sealed record SensorReading(
    string Id,
    string Kind,
    string Group,
    string Chip,
    string Label,
    double Value,
    string Unit,
    int Order,
    string? Critical,
    string? Role,
    double? Min,
    double? Max,
    double[]? History
);
