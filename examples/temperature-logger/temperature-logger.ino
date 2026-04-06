// Temperature Logger — reads temperature every second and logs min/max/avg
//
// Works on: esp32
//
// Run (simulation):
//   simboard run examples/temperature-logger/temperature-logger.ino --board esp32
//
// Inject temperature readings via ADC (pin 35):
//   ADC 0    =   0°C
//   ADC 2047 =  50°C
//   ADC 4095 = 100°C
//
// Example — simulate temperature rising from 20°C to 80°C:
//   (
//     sleep 8
//     echo "pin 35 adc 819"    # 20°C
//     sleep 5
//     echo "pin 35 adc 2457"   # 60°C
//     sleep 5
//     echo "pin 35 adc 3277"   # 80°C
//     sleep 5
//     echo "exit"
//   ) | simboard run examples/temperature-logger/temperature-logger.ino --board esp32

#ifdef SIMBOARD
#include <esp_task_wdt.h>
#endif

// ── Configuration ─────────────────────────────────────────────────────────────
const int   TEMP_PIN       = 35;
const float TEMP_MIN_C     = 0.0;
const float TEMP_MAX_C     = 100.0;
const float ALERT_TEMP     = 40.0; // °C — warn when above this
#ifdef SIMBOARD
const unsigned long LOG_INTERVAL = 500UL;
#else
const unsigned long LOG_INTERVAL = 1000UL;
#endif

// ── State ─────────────────────────────────────────────────────────────────────
float tempMin     =  999.0;
float tempMax     = -999.0;
float tempSum     = 0.0;
int   readCount   = 0;

// ── SIMBOARD ──────────────────────────────────────────────────────────────────
#ifdef SIMBOARD
int    simAdcTemp = 819; // default ~20°C
String simBuf     = "";

void handleSimPinControl() {
  while (Serial1.available()) {
    char c = (char)Serial1.read();
    if (c == '\n') {
      simBuf.trim();
      if (simBuf.startsWith("SET ")) {
        int sp1 = simBuf.indexOf(' ');
        int sp2 = simBuf.indexOf(' ', sp1 + 1);
        if (sp1 > 0 && sp2 > sp1) {
          int pin = simBuf.substring(sp1 + 1, sp2).toInt();
          int val = simBuf.substring(sp2 + 1).toInt();
          if (pin == TEMP_PIN) {
            simAdcTemp = val;
            float t = map(val, 0, 4095, (int)(TEMP_MIN_C * 10), (int)(TEMP_MAX_C * 10)) / 10.0;
            Serial.print("[SIM] pin ");
            Serial.print(pin);
            Serial.print(" = ADC ");
            Serial.print(val);
            Serial.print(" -> ");
            Serial.print(t, 1);
            Serial.println("°C");
          }
        }
      }
      simBuf = "";
    } else if (c != '\r') {
      simBuf += c;
    }
  }
}
#endif

// ── Helpers ───────────────────────────────────────────────────────────────────
float readTemp() {
#ifdef SIMBOARD
  return map(simAdcTemp, 0, 4095, (int)(TEMP_MIN_C * 10), (int)(TEMP_MAX_C * 10)) / 10.0;
#else
  int adc = analogRead(TEMP_PIN);
  return map(adc, 0, 4095, (int)(TEMP_MIN_C * 10), (int)(TEMP_MAX_C * 10)) / 10.0;
#endif
}

// ── Arduino ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
#ifdef SIMBOARD
  Serial1.begin(115200, SERIAL_8N1, 16, 17);
  esp_task_wdt_deinit();
  disableCore0WDT();
  disableCore1WDT();
#else
  analogReadResolution(12);
#endif
  Serial.println("Temperature logger started.");
  Serial.println("temp(C) | min | max | avg | status");
}

void loop() {
#ifdef SIMBOARD
  handleSimPinControl();
#endif

  float temp = readTemp();
  readCount++;
  tempSum += temp;
  if (temp < tempMin) tempMin = temp;
  if (temp > tempMax) tempMax = temp;
  float avg = tempSum / readCount;

  Serial.print(temp, 1);
  Serial.print("°C | min:");
  Serial.print(tempMin, 1);
  Serial.print(" max:");
  Serial.print(tempMax, 1);
  Serial.print(" avg:");
  Serial.print(avg, 1);
  Serial.print(" | ");
  Serial.println(temp > ALERT_TEMP ? "HOT!" : "OK");

  delay(LOG_INTERVAL);
}
