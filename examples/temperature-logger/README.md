# temperature-logger

Reads temperature from an ADC pin every second and logs a running min/max/avg. Prints a `HOT!` warning when temperature exceeds 40°C.

Good example of injecting multiple sensor values over time to observe how the firmware tracks state.

## Run in simulation

```bash
simboard run examples/temperature-logger/temperature-logger.ino --board esp32
```

Default simulated temperature is 20°C.

## Inject temperature readings

Pin 35 maps ADC values to temperature:

```
ADC    0 =   0°C
ADC  819 =  20°C
ADC 2047 =  50°C
ADC 2457 =  60°C
ADC 3277 =  80°C
ADC 4095 = 100°C
```

Simulate temperature rising, exceeding the threshold, then cooling:

```bash
(
  sleep 8
  echo "pin 35 adc 819"    # 20°C — baseline
  sleep 5
  echo "pin 35 adc 2047"   # 50°C — above alert threshold
  sleep 5
  echo "pin 35 adc 3277"   # 80°C — very hot
  sleep 5
  echo "pin 35 adc 819"    # back to 20°C
  sleep 5
  echo "exit"
) | simboard run examples/temperature-logger/temperature-logger.ino --board esp32
```

## Expected output

```
Temperature logger started.
temp(C) | min | max | avg | status
20.0°C | min:20.0 max:20.0 avg:20.0 | OK
20.0°C | min:20.0 max:20.0 avg:20.0 | OK
50.0°C | min:20.0 max:50.0 avg:30.0 | HOT!
50.0°C | min:20.0 max:50.0 avg:35.0 | HOT!
80.0°C | min:20.0 max:80.0 avg:42.5 | HOT!
20.0°C | min:20.0 max:80.0 avg:38.0 | OK
```

## Thresholds

| Constant | Default | Description |
|----------|---------|-------------|
| `ALERT_TEMP` | 40.0°C | Prints `HOT!` above this |
| `TEMP_MIN_C` | 0°C | ADC lower bound mapping |
| `TEMP_MAX_C` | 100°C | ADC upper bound mapping |
| `LOG_INTERVAL` | 1000ms (500ms in sim) | Logging frequency |
