import { describe, expect, it } from 'vitest'
import {
  parseSmartctl,
  smartctlDevice,
  splitElevatedOutput,
  type SmartctlAttribute,
  type SmartctlJson
} from '@main/features/health/smartctl'
import { buildVerdict } from '@main/features/health/verdict'
import { parseWindowsHealth, type WindowsRaw } from '@main/features/health/windows'

/**
 * The health readers are tested from fixtures: the CI machine does not have
 * the disks (nor Windows) that produced them. The fixtures are real smartctl
 * shapes, with the fields trimmed to the ones the card uses.
 */

function attribute(
  id: number,
  name: string,
  value: number,
  raw: number,
  whenFailed = ''
): SmartctlAttribute {
  return {
    id,
    name,
    value,
    worst: value,
    thresh: 10,
    when_failed: whenFailed,
    raw: { value: raw, string: String(raw) }
  }
}

function nvmeJson(overrides: Partial<SmartctlJson> = {}): SmartctlJson {
  return {
    model_name: 'KINGSTON SNV3S1000G',
    serial_number: '50026B768713061E',
    firmware_version: 'ERFK1N.3',
    smart_status: { passed: true },
    temperature: { current: 42 },
    power_on_time: { hours: 1234 },
    power_cycle_count: 321,
    nvme_smart_health_information_log: {
      critical_warning: 0,
      temperature: 42,
      available_spare: 100,
      available_spare_threshold: 10,
      percentage_used: 3,
      data_units_read: 2000,
      data_units_written: 3000,
      power_cycles: 321,
      power_on_hours: 1234,
      media_errors: 0,
      num_err_log_entries: 5
    },
    smartctl: {
      messages: [
        { severity: 'information', string: 'SMART support is: Available' }
      ]
    },
    ...overrides
  }
}

describe('parseSmartctl', () => {
  it('reads the NVMe health log', () => {
    const parsed = parseSmartctl(nvmeJson())

    expect(parsed.model).toBe('KINGSTON SNV3S1000G')
    expect(parsed.serial).toBe('50026B768713061E')
    expect(parsed.firmware).toBe('ERFK1N.3')
    expect(parsed.metrics).toMatchObject({
      temperatureC: 42,
      wearPercent: 3,
      powerOnHours: 1234,
      powerCycles: 321,
      availableSpare: 100,
      mediaErrors: 0,
      smartStatus: 'PASSED',
      smartPassed: true
    })
    // NVMe data units are 1000 * 512 bytes.
    expect(parsed.metrics.writtenBytes).toBe(3000 * 1000 * 512)
    expect(parsed.metrics.readBytes).toBe(2000 * 1000 * 512)
    expect(parsed.metrics.notes).toEqual([])
  })

  it('reads the ATA attributes, including the life-left ones', () => {
    const json: SmartctlJson = {
      model_name: 'KBM SSD 256GB',
      smart_status: { passed: true },
      ata_smart_attributes: {
        table: [
          attribute(5, 'Reallocated_Sector_Ct', 100, 8),
          attribute(9, 'Power_On_Hours', 100, 25000),
          attribute(12, 'Power_Cycle_Count', 100, 1200),
          attribute(194, 'Temperature_Celsius', 100, 38),
          attribute(197, 'Current_Pending_Sector', 100, 2),
          attribute(198, 'Offline_Uncorrectable', 100, 1),
          attribute(231, 'SSD_Life_Left', 90, 0)
        ]
      }
    }

    const metrics = parseSmartctl(json).metrics
    expect(metrics).toMatchObject({
      reallocatedSectors: 8,
      pendingSectors: 2,
      uncorrectableSectors: 1,
      powerOnHours: 25000,
      powerCycles: 1200,
      temperatureC: 38,
      // 90% left -> 10% used.
      wearPercent: 10
    })
  })

  it('falls back to attribute 187 when 198 is missing', () => {
    const metrics = parseSmartctl({
      ata_smart_attributes: {
        table: [attribute(187, 'Reported_Uncorrect', 100, 4)]
      }
    }).metrics

    expect(metrics.uncorrectableSectors).toBe(4)
  })

  it('keeps the smartctl warnings and drops the informational ones', () => {
    const parsed = parseSmartctl(
      nvmeJson({
        smartctl: {
          messages: [
            { severity: 'information', string: 'SMART support is: Available' },
            { severity: 'warning', string: 'Unsupported USB bridge' },
            { severity: 'error', string: 'Read SMART Data failed' }
          ]
        }
      })
    )

    expect(parsed.metrics.notes).toEqual([
      'Unsupported USB bridge',
      'Read SMART Data failed'
    ])
  })

  it('does not invent values for a drive that answers nothing', () => {
    const parsed = parseSmartctl({ smartctl: { messages: [] } })

    expect(parsed.model).toBeUndefined()
    expect(parsed.metrics.temperatureC).toBeUndefined()
    expect(parsed.metrics.wearPercent).toBeUndefined()
    expect(parsed.metrics.smartPassed).toBeUndefined()
  })
})

describe('smartctlDevice', () => {
  it('addresses the NVMe controller instead of the namespace', () => {
    expect(smartctlDevice('/dev/nvme0n1')).toBe('/dev/nvme0')
    expect(smartctlDevice('/dev/nvme1n1')).toBe('/dev/nvme1')
    expect(smartctlDevice('/dev/nvme0')).toBe('/dev/nvme0')
    expect(smartctlDevice('/dev/sda')).toBe('/dev/sda')
  })
})

describe('splitElevatedOutput', () => {
  it('splits the batch by the device marker', () => {
    const stdout = [
      '',
      '@@MYRGB_DEVICE /dev/sda',
      '{"model_name":"KBM SSD 256GB"}',
      '@@MYRGB_DEVICE /dev/nvme0',
      '{"model_name":"KINGSTON SNV3S1000G"}'
    ].join('\n')

    const byDevice = splitElevatedOutput(stdout)
    expect(byDevice.size).toBe(2)
    expect(byDevice.get('/dev/sda')?.model_name).toBe('KBM SSD 256GB')
    expect(byDevice.get('/dev/nvme0')?.model_name).toBe('KINGSTON SNV3S1000G')
  })

  it('skips devices whose output was empty or not JSON', () => {
    const stdout = [
      '@@MYRGB_DEVICE /dev/sdb',
      '',
      '@@MYRGB_DEVICE /dev/sdc',
      'smartctl: not supported'
    ].join('\n')

    expect(splitElevatedOutput(stdout).size).toBe(0)
  })
})

describe('buildVerdict', () => {
  it('never calls a disk healthy without a metric', () => {
    expect(buildVerdict({ media: 'usb', dataAvailable: false }).verdict).toBe('unknown')
    expect(
      buildVerdict({ media: 'ssd', dataAvailable: true, temperatureC: 42 }).verdict
    ).toBe('good')
  })

  it('treats the drive failure prediction as critical', () => {
    const result = buildVerdict({ media: 'ssd', dataAvailable: true, smartPassed: false })
    expect(result.verdict).toBe('critical')
    expect(result.reasons[0]).toMatch(/S\.M\.A\.R\.T\./)
  })

  it('uses wear thresholds of 80% and 95%', () => {
    expect(buildVerdict({ media: 'ssd', dataAvailable: true, wearPercent: 79 }).verdict).toBe('good')
    expect(buildVerdict({ media: 'ssd', dataAvailable: true, wearPercent: 80 }).verdict).toBe(
      'warning'
    )
    expect(buildVerdict({ media: 'ssd', dataAvailable: true, wearPercent: 95 }).verdict).toBe(
      'critical'
    )
  })

  it('uses different temperature limits for HDD and flash', () => {
    expect(
      buildVerdict({ media: 'ssd', dataAvailable: true, temperatureC: 74 }).verdict
    ).toBe('warning')
    expect(
      buildVerdict({ media: 'ssd', dataAvailable: true, temperatureC: 90 }).verdict
    ).toBe('critical')
    expect(
      buildVerdict({ media: 'hdd', dataAvailable: true, temperatureC: 60 }).verdict
    ).toBe('warning')
    expect(
      buildVerdict({ media: 'hdd', dataAvailable: true, temperatureC: 70 }).verdict
    ).toBe('critical')
  })

  it('flags reallocated, pending and uncorrectable sectors as attention', () => {
    const result = buildVerdict({
      media: 'hdd',
      dataAvailable: true,
      reallocatedSectors: 8,
      pendingSectors: 2,
      uncorrectableSectors: 1
    })

    expect(result.verdict).toBe('warning')
    expect(result.reasons).toHaveLength(3)
  })

  it('turns a failed attribute into critical, and a past one into warning', () => {
    expect(
      buildVerdict({ media: 'ssd', dataAvailable: true, failedAttribute: 'now' }).verdict
    ).toBe('critical')
    expect(
      buildVerdict({ media: 'ssd', dataAvailable: true, failedAttribute: 'past' }).verdict
    ).toBe('warning')
  })

  it('uses the Windows health status the same way', () => {
    expect(
      buildVerdict({ media: 'ssd', dataAvailable: true, healthStatus: 2 }).verdict
    ).toBe('critical')
    expect(
      buildVerdict({ media: 'ssd', dataAvailable: true, healthStatus: 1 }).verdict
    ).toBe('warning')
  })
})

describe('parseWindowsHealth', () => {
  const raw: WindowsRaw = {
    disks: [
      {
        DeviceId: 0,
        FriendlyName: 'KINGSTON SNV3S1000G',
        SerialNumber: '50026B768713061E',
        MediaType: 4,
        BusType: 17,
        HealthStatus: 0,
        Size: 1000204886016
      },
      {
        DeviceId: 1,
        FriendlyName: 'ST3500312CS',
        MediaType: 3,
        BusType: 11,
        HealthStatus: 1,
        Size: 500106780160
      },
      {
        DeviceId: 2,
        FriendlyName: 'USB DISK 3.0',
        MediaType: 0,
        BusType: 7,
        HealthStatus: 0,
        Size: 16000000000
      }
    ],
    counters: [
      {
        DeviceId: 0,
        Temperature: 42,
        Wear: 3,
        PowerOnHours: 1234,
        StartStopCycleCount: 321
      },
      {
        DeviceId: 1,
        Temperature: 40,
        PowerOnHours: 30000,
        WriteErrorsUncorrected: 2
      }
    ],
    physical: [
      { Index: 0, PNPDeviceID: 'SCSI\\DISK&VEN_KINGSTON' },
      { Index: 1, PNPDeviceID: 'SCSI\\DISK&VEN_SEAGATE' }
    ],
    predict: [
      {
        InstanceName: 'SCSI\\DISK&VEN_SEAGATE\\5&1',
        PredictFailure: true
      }
    ]
  }

  it('joins the disks with the reliability counters', () => {
    const { cards } = parseWindowsHealth(raw)

    expect(cards).toHaveLength(3)
    expect(cards[0]).toMatchObject({
      device: 'PHYSICALDRIVE0',
      title: 'KINGSTON SNV3S1000G',
      verdict: 'good',
      temperatureC: 42,
      wearPercent: 3,
      powerOnHours: 1234,
      powerCycles: 321
    })
    expect(cards[0].meta).toContain('NVMe')
  })

  it('attaches the failure prediction to the right disk', () => {
    const { cards } = parseWindowsHealth(raw)

    expect(cards[1].verdict).toBe('critical')
    expect(cards[1].reasons.join(' ')).toMatch(/falhar em breve/)
    // The healthy NVMe in the same machine must not inherit the alarm.
    expect(cards[0].verdict).toBe('good')
  })

  it('leaves a USB stick without counters as "sem dados"', () => {
    const { cards } = parseWindowsHealth(raw)

    expect(cards[2].verdict).toBe('unknown')
    expect(cards[2].dataAvailable).toBe(false)
    expect(cards[2].meta).toContain('USB')
  })

  it('ignores the CIM "not supported" sentinel values', () => {
    const { cards } = parseWindowsHealth({
      disks: [
        {
          DeviceId: '0',
          FriendlyName: 'Disco',
          MediaType: 4,
          BusType: 11,
          HealthStatus: 5
        }
      ],
      counters: [
        {
          DeviceId: '0',
          Temperature: 0xffffffff,
          Wear: 0xffffffff,
          PowerOnHours: 0xffffffff
        }
      ]
    })

    expect(cards[0].temperatureC).toBeUndefined()
    expect(cards[0].wearPercent).toBeUndefined()
    expect(cards[0].powerOnHours).toBeUndefined()
    expect(cards[0].verdict).toBe('unknown')
  })

  it('warns when the prediction cannot be matched to a disk', () => {
    const health = parseWindowsHealth({
      disks: [
        { DeviceId: 0, FriendlyName: 'Disco', MediaType: 4, BusType: 11, HealthStatus: 0 }
      ],
      counters: [{ DeviceId: 0, Temperature: 40 }],
      predict: [{ InstanceName: 'SCSI\\DISK&VEN_UNKNOWN', PredictFailure: true }]
    })

    expect(health.notes[0]).toMatch(/não foi possível identificar/i)
  })
})
