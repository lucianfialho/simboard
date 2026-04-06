# blink

The hello world of embedded — toggles an LED and prints the state to Serial every 500ms.

Works on all supported boards: `uno`, `nano`, `mega`, `esp32`.

## Run

```bash
simboard run examples/blink/blink.ino --board uno
simboard run examples/blink/blink.ino --board esp32
```

## Expected output

```
Blink started.
LED: ON
LED: OFF
LED: ON
LED: OFF
```

## Stop

Press `Ctrl+C` or pipe an exit command:

```bash
(sleep 5; echo "exit") | simboard run examples/blink/blink.ino --board uno
```
