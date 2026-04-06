# simboard

Headless microcontroller simulator CLI. Compile and run Arduino/ESP32 firmware locally, stream Serial output to stdout, inject sensor values via stdin.

## Install

```bash
git clone <repo>
cd simboard
npm install
npm link
```

## Usage

```bash
# List available boards
simboard boards

# Run a sketch (installs toolchain on first run)
simboard run sketch.ino --board uno
simboard run sketch.ino --board esp32

# Compile only (print binary path)
simboard compile sketch.ino --board esp32

# Check toolchain status
simboard doctor
```

## Pin control (stdin)

While the simulation is running, send commands via stdin:

```
pin <n> adc <0-4095>   Set ADC value on pin N
pin <n> high           Set digital pin N HIGH
pin <n> low            Set digital pin N LOW
exit                   Stop simulation cleanly
```

## AI usage (via Bash tool)

```bash
# Set a sensor value, wait, then exit
(echo "pin 34 adc 100"; sleep 10; echo "exit") \
  | simboard run sketch.ino --board esp32
```

## Boards

| Flag    | Architecture | First-run download |
|---------|-------------|-------------------|
| `uno`   | AVR          | ~25MB             |
| `nano`  | AVR          | ~25MB             |
| `mega`  | AVR          | ~25MB             |
| `esp32` | Xtensa LX6   | ~540MB            |

## Toolchain

All tools are installed to `~/.simboard/` on first run:
- `arduino-cli` — compiles `.ino` sketches
- `qemu-system-xtensa` — emulates ESP32 (espressif/qemu fork)
- Arduino AVR core (`arduino:avr`) — AVR compilation
- ESP32 Arduino core (`esp32:esp32`) — ESP32 compilation

No sudo required.

## Architecture

```
simboard run sketch.ino --board esp32
        │
        ├─ installer.js    Downloads toolchain if needed
        ├─ compiler.js     Invokes arduino-cli, returns binary path
        ├─ runner.js       Orchestrates simulation + I/O
        └─ adapters/
           ├─ avr.js      avr8js — pure JS AVR emulator
           └─ esp32.js    QEMU subprocess + TCP serial bridge
```

## Debugging

```bash
# Show QEMU stderr output
DEBUG=1 simboard run sketch.ino --board esp32
```
