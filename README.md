# simboard

Compile and run Arduino/ESP32 firmware locally — no hardware required.

Serial output streams to stdout. Sensor values are injected via stdin. Works for humans and AI agents alike.

```
$ (sleep 5; echo "pin 34 adc 3500"; sleep 10; echo "exit") | simboard run plant-monitor.ino --board esp32

[SIMBOARD] Wi-Fi desativado em modo simulação.
Setup completo.
Umidade: 100% | alerted: false
Sem ação necessária.
[SIMBOARD] Pin 34 = ADC 3500 -> Umidade: 14%
Umidade: 14% | alerted: false
Solo SECO — enviando alerta.
[SIMBOARD] POST Discord webhook -> Umidade: 14%
Umidade: 14% | alerted: true
```

---

## How it works

simboard compiles your sketch with `arduino-cli` and runs it in an emulator:

- **AVR boards** (Uno, Nano, Mega) → [avr8js](https://github.com/wokwi/avr8js) — pure JavaScript AVR emulator, no subprocess
- **ESP32** → [espressif/qemu](https://github.com/espressif/qemu) — full QEMU fork with ESP32 machine support

For ESP32, two TCP serial ports are bridged:
- `UART0` → stdout (firmware `Serial.print`)
- `UART1` → stdin (pin injection commands)

All toolchain binaries are installed to `~/.simboard/` on first run. No sudo required.

---

## Install

```bash
git clone https://github.com/lucianfialho/simboard
cd simboard
npm install
npm link
```

First run will download the toolchain automatically (~25MB for AVR, ~540MB for ESP32).

---

## Usage

```bash
# Run a sketch
simboard run sketch.ino --board uno
simboard run sketch.ino --board esp32

# Compile only (prints binary path)
simboard compile sketch.ino --board esp32

# List available boards
simboard boards

# Check toolchain status
simboard doctor
```

### Inject sensor values at runtime

While the simulation is running, pipe commands via stdin:

```
pin <n> adc <0-4095>   Set ADC value on pin N (analog sensor)
pin <n> high           Set digital pin N HIGH
pin <n> low            Set digital pin N LOW
exit                   Stop the simulation
```

Example — simulate a moisture sensor drying out, then recovering:

```bash
(
  sleep 5
  echo "pin 34 adc 3500"   # dry soil (~14%)
  sleep 10
  echo "pin 34 adc 500"    # wet soil (~88%)
  sleep 5
  echo "exit"
) | simboard run plant-monitor.ino --board esp32
```

---

## Adapting firmware for simulation

Add `#ifdef SIMBOARD` guards to skip hardware-specific code (WiFi, HTTP, deep sleep) and replace sensor reads with simulated values:

```cpp
#ifndef SIMBOARD
#include <WiFi.h>
#include <HTTPClient.h>
#else
#include <esp_task_wdt.h>
#endif

// Simulated sensor value — updated via UART1 pin injection
#ifdef SIMBOARD
int simMoisture = 100;
String simBuf = "";

void handleSimPinControl() {
  while (Serial1.available()) {
    char c = (char)Serial1.read();
    if (c == '\n') {
      simBuf.trim();
      if (simBuf.startsWith("SET ")) {
        int pin = simBuf.substring(4, simBuf.indexOf(' ', 4)).toInt();
        int val = simBuf.substring(simBuf.lastIndexOf(' ') + 1).toInt();
        if (pin == SENSOR_PIN)
          simMoisture = constrain(map(val, 4095, 0, 0, 100), 0, 100);
      }
      simBuf = "";
    } else if (c != '\r') {
      simBuf += c;
    }
  }
}
#endif

void setup() {
  Serial.begin(115200);
#ifdef SIMBOARD
  Serial1.begin(115200, SERIAL_8N1, 16, 17);
  esp_task_wdt_deinit();
  disableCore0WDT();
  disableCore1WDT();
#endif
}

int readMoisture() {
#ifdef SIMBOARD
  return simMoisture;
#else
  return map(analogRead(SENSOR_PIN), 4095, 0, 0, 100);
#endif
}
```

simboard automatically passes `-DSIMBOARD` when compiling for simulation, so production builds are unaffected.

---

## AI agent usage

simboard is designed to work cleanly as a tool for AI agents (Claude, GPT, etc.) via the `Bash` tool:

```bash
# Run firmware and inject a sensor reading after 5 seconds
(sleep 5; echo "pin 34 adc 3500"; sleep 15; echo "exit") \
  | simboard run sketch.ino --board esp32
```

The agent can read Serial output from stdout and make assertions about firmware behavior — no hardware, no mocking, real compiled code running in a real emulator.

---

## Boards

| Flag     | Architecture | Emulator       | First-run download |
|----------|-------------|----------------|-------------------|
| `uno`    | AVR          | avr8js (JS)    | ~25 MB            |
| `nano`   | AVR          | avr8js (JS)    | ~25 MB            |
| `mega`   | AVR          | avr8js (JS)    | ~25 MB            |
| `esp32`  | Xtensa LX6   | QEMU           | ~540 MB           |

---

## Architecture

```
simboard run sketch.ino --board esp32
        │
        ├─ installer.js     Downloads toolchain on first run
        ├─ compiler.js      Invokes arduino-cli, merges ESP32 flash image
        ├─ runner.js        Orchestrates adapter + stdin/stdout bridge
        └─ adapters/
           ├─ avr.js        avr8js loop + GPIO/ADC injection
           └─ esp32.js      QEMU subprocess + dual TCP serial bridge
                            UART0 = Serial output → stdout
                            UART1 = pin commands ← stdin
```

### ESP32 flash image

For ESP32, `compiler.js` merges the arduino-cli build artifacts into a single 4 MB flash image that QEMU can boot directly:

```
0x00000  ░░░░░░░░░░░░░░░  (erased)
0x01000  [bootloader.bin]
0x08000  [partitions.bin]
0x10000  [app.bin        ]
```

---

## Debugging

```bash
# Show QEMU stderr (boot logs, WDT resets, etc.)
DEBUG=1 simboard run sketch.ino --board esp32
```

---

## Known limitations

- **ESP32 WDT**: QEMU's timer emulation can trigger the interrupt watchdog on the first boot cycle. The firmware reboots once and runs stably from the second cycle. Add `esp_task_wdt_deinit()` + `disableCore0WDT()` + `disableCore1WDT()` in your `SIMBOARD` setup block.
- **No WiFi/BLE emulation**: Network peripherals are not emulated. Use `#ifdef SIMBOARD` guards to skip them.
- **ESP32 only** for now — ESP32-S2/S3/C3 variants not tested.

---

## License

MIT
