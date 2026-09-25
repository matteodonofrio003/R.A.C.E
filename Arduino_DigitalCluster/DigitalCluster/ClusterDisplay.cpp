#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>
#include <string.h>
#include "ClusterConfig.h"
#include "ClusterDisplay.h"

static LiquidCrystal_I2C lcd(LCD_I2C_ADDRESS, 16U, 2U);

static void writeLine(uint8_t row, const char *text) {
  lcd.setCursor(0, row);
  lcd.print(text);
}

static void updateOutputs(uint16_t rpm, bool offtrack) {
  static bool buzzing = false;
  digitalWrite(LED_GREEN_PIN, rpm >= RPM_GREEN_THRESHOLD ? HIGH : LOW);
  digitalWrite(LED_YELLOW_PIN, rpm >= RPM_YELLOW_THRESHOLD ? HIGH : LOW);
  digitalWrite(LED_RED_PIN, rpm >= RPM_RED_THRESHOLD ? HIGH : LOW);
  if (offtrack != buzzing) {
    buzzing = offtrack;
    if (offtrack) tone(BUZZER_PIN, OFFTRACK_FREQUENCY_HZ);
    else noTone(BUZZER_PIN);
    Serial.println(offtrack ? F("ALARM ON: D7") : F("ALARM OFF: D7"));
  }
}

void clusterDisplayBegin(void) {
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_YELLOW_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_YELLOW_PIN, LOW);
  digitalWrite(LED_RED_PIN, LOW);
  noTone(BUZZER_PIN);
  lcd.init();
  lcd.backlight();
  clusterDisplayShowNoTelemetry();
}

void clusterDisplayUpdate(const TelemetryPacket *packet) {
  char speed_value[7];
  char line_0[17];
  char line_1[17];
  dtostrf(packet->speed_kmh, 5, 1, speed_value);
  snprintf(line_0, sizeof(line_0), "Speed:%s km/h", speed_value);
  snprintf(line_1, sizeof(line_1), "RPM:%4u        ", packet->rpm);
  if (packet->flags & 1U) memcpy(line_1, "OFF TRACK!      ", 17U);
  writeLine(0U, line_0);
  writeLine(1U, line_1);
  updateOutputs(packet->rpm, (packet->flags & 1U) != 0U);
}

void clusterDisplayShowNoTelemetry(void) {
  writeLine(0U, "NO ECU DATA     ");
  writeLine(1U, "Check UART link ");
  updateOutputs(0U, false);
}
