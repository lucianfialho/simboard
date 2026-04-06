# plant-monitor

Reads soil moisture from an ADC pin every 30 minutes and sends a Discord webhook alert when the soil is too dry. Includes anti-spam logic — only alerts once per dry period, re-arms when the soil recovers.

## Hardware

| Component | Connection |
|-----------|-----------|
| Capacitive soil sensor | GPIO34 (ADC) |
| VCC | 3.3V |
| GND | GND |

## Setup (real hardware)

Copy `secrets.h.example` to `secrets.h` and fill in your credentials:

```bash
cp secrets.h.example secrets.h
```

```cpp
const char* WIFI_SSID     = "your-wifi";
const char* WIFI_PASSWORD = "your-password";
const char* WEBHOOK_URL   = "https://discord.com/api/webhooks/...";
```

`secrets.h` is gitignored — your credentials stay local.

## Run in simulation

```bash
simboard run examples/plant-monitor/plant-monitor.ino --board esp32
```

## Inject sensor readings

While the simulation runs, set the ADC value on pin 34:

```
ADC 0    =  100% moisture (wet)
ADC 4095 =    0% moisture (completely dry)
```

Simulate soil drying out, triggering an alert, then recovering:

```bash
(
  sleep 10
  echo "pin 34 adc 3500"   # ~14% — triggers dry alert
  sleep 10
  echo "pin 34 adc 500"    # ~88% — soil recovered, alert re-armed
  sleep 5
  echo "exit"
) | simboard run examples/plant-monitor/plant-monitor.ino --board esp32
```

## Expected output

```
[SIM] WiFi skipped.
Ready.
moisture: 100% | alerted: false
OK.
[SIM] pin 34 = ADC 3500 -> moisture: 14%
moisture: 14% | alerted: false
DRY — sending alert.
[SIM] Discord webhook -> moisture: 14% (real hardware would POST here)
moisture: 14% | alerted: true
OK.
...
[SIM] pin 34 = ADC 500 -> moisture: 88%
moisture: 88% | alerted: true
Recovered — alert re-armed.
moisture: 88% | alerted: false
OK.
```

## Thresholds

| Constant | Default | Description |
|----------|---------|-------------|
| `DRY_THRESHOLD` | 30% | Alert fires below this |
| `RESET_THRESHOLD` | 50% | Alert re-arms above this |
| `CHECK_INTERVAL` | 30 min (500ms in sim) | How often to check |
