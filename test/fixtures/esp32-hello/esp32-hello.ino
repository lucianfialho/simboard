void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 READY");
}

void loop() {
  Serial.println("HELLO");
  delay(1000);
}
