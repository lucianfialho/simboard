// Plant Monitor — reads soil moisture and sends a Discord alert when dry
//
// Works on: esp32
//
// Run (simulation):
//   simboard run examples/plant-monitor/plant-monitor.ino --board esp32
//
// Inject a dry reading after 10 seconds:
//   (sleep 10; echo "pin 34 adc 3500"; sleep 15; echo "exit") \
//     | simboard run examples/plant-monitor/plant-monitor.ino --board esp32
//
// Hardware wiring:
//   Capacitive soil sensor → GPIO34 (ADC)
//   VCC → 3.3V, GND → GND
//
// For real hardware, copy secrets.h.example to secrets.h and fill in your credentials.

#ifndef SIMBOARD
#include <WiFi.h>
#include <HTTPClient.h>
#else
#include <esp_task_wdt.h>
#endif

// ── Configuration ────────────────────────────────────────────────────────────
const int          SENSOR_PIN      = 34;
const int          DRY_THRESHOLD   = 30;  // % — alert when below this
const int          RESET_THRESHOLD = 50;  // % — re-arm alert when above this
#ifdef SIMBOARD
const unsigned long CHECK_INTERVAL = 500UL;     // 500 ms in simulation
#else
const unsigned long CHECK_INTERVAL = 1800000UL; // 30 min in production
#endif

#ifndef SIMBOARD
// secrets.h must define: WIFI_SSID, WIFI_PASSWORD, WEBHOOK_URL
#include "secrets.h"
#endif

// ── State ─────────────────────────────────────────────────────────────────────
bool alerted = false;

// ── SIMBOARD: simulated sensor + pin control via Serial1 ─────────────────────
#ifdef SIMBOARD
int    simMoisture = 100;
String simBuf      = "";

void handleSimPinControl() {
  while (Serial1.available()) {
    char c = (char)Serial1.read();
    if (c == '\n') {
      simBuf.trim();
      if (simBuf.startsWith("SET ")) {
        int sp1 = simBuf.indexOf(' ');
        int sp2 = simBuf.indexOf(' ', sp1 + 1);
        if (sp1 > 0 && sp2 > sp1) {
          int pin    = simBuf.substring(sp1 + 1, sp2).toInt();
          int adcVal = simBuf.substring(sp2 + 1).toInt();
          if (pin == SENSOR_PIN) {
            simMoisture = constrain(map(adcVal, 4095, 0, 0, 100), 0, 100);
            Serial.print("[SIM] pin ");
            Serial.print(pin);
            Serial.print(" = ADC ");
            Serial.print(adcVal);
            Serial.print(" -> moisture: ");
            Serial.print(simMoisture);
            Serial.println("%");
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
void connectWiFi() {
#ifdef SIMBOARD
  Serial.println("[SIM] WiFi skipped.");
#else
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected!" : " failed.");
#endif
}

int readMoisture() {
#ifdef SIMBOARD
  return simMoisture;
#else
  return constrain(map(analogRead(SENSOR_PIN), 4095, 0, 0, 100), 0, 100);
#endif
}

void sendAlert(int moisture) {
#ifdef SIMBOARD
  Serial.print("[SIM] Discord webhook -> moisture: ");
  Serial.print(moisture);
  Serial.println("% (real hardware would POST here)");
#else
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ALERT] WiFi disconnected — skipping.");
    return;
  }
  HTTPClient http;
  http.begin(WEBHOOK_URL);
  http.addHeader("Content-Type", "application/json");
  String body = "{\"content\":\"Your plant is thirsty! Moisture: " + String(moisture) + "%\"}";
  int code = http.POST(body);
  Serial.print("[WEBHOOK] HTTP ");
  Serial.println(code);
  http.end();
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
  connectWiFi();
  Serial.println("Ready.");
}

void loop() {
#ifdef SIMBOARD
  handleSimPinControl();
#endif

  int moisture = readMoisture();
  Serial.print("moisture: ");
  Serial.print(moisture);
  Serial.print("% | alerted: ");
  Serial.println(alerted ? "true" : "false");

  if (moisture < DRY_THRESHOLD && !alerted) {
    Serial.println("DRY — sending alert.");
    sendAlert(moisture);
    alerted = true;
  } else if (moisture >= RESET_THRESHOLD && alerted) {
    Serial.println("Recovered — alert re-armed.");
    alerted = false;
  } else {
    Serial.println("OK.");
  }

  delay(CHECK_INTERVAL);
}
