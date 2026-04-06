# examples

Ready-to-run sketches for simboard. Each example demonstrates a different pattern.

| Example | Board | What it shows |
|---------|-------|---------------|
| [blink](./blink/) | uno, nano, mega, esp32 | Minimal setup — LED toggle + Serial output |
| [plant-monitor](./plant-monitor/) | esp32 | ADC sensor + threshold alerts + anti-spam state |
| [temperature-logger](./temperature-logger/) | esp32 | Multiple sensor injections + running stats (min/max/avg) |

## Quick start

```bash
# Clone simboard
git clone https://github.com/lucianfialho/simboard
cd simboard
npm install && npm link

# Run any example
simboard run examples/blink/blink.ino --board uno
simboard run examples/plant-monitor/plant-monitor.ino --board esp32
simboard run examples/temperature-logger/temperature-logger.ino --board esp32
```

First run downloads the toolchain automatically (~25MB for AVR, ~540MB for ESP32).

See each example's `README.md` for how to inject sensor values and what output to expect.
