// Blink — hello world for simboard
//
// Works on: uno, nano, mega, esp32
//
// Run:
//   simboard run examples/blink/blink.ino --board uno
//   simboard run examples/blink/blink.ino --board esp32

#ifdef ESP32
const int LED_PIN = 2;
#else
const int LED_PIN = 13; // built-in LED on AVR boards
#endif

int state = 0;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  Serial.println("Blink started.");
}

void loop() {
  state = !state;
  digitalWrite(LED_PIN, state);
  Serial.print("LED: ");
  Serial.println(state ? "ON" : "OFF");
  delay(500);
}
