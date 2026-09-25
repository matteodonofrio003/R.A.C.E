#ifndef RACE_CLUSTER_CONFIG_H
#define RACE_CLUSTER_CONFIG_H

#include <Arduino.h>

#define ECU_RX_PIN              10U
#define ECU_UNUSED_TX_PIN       A0
#define LCD_I2C_ADDRESS         0x27U
#define LED_GREEN_PIN           6U
#define LED_YELLOW_PIN          8U
#define LED_RED_PIN             9U
#define BUZZER_PIN              7U
#define ECU_BAUD_RATE           38400UL
#define TELEMETRY_TIMEOUT_MS    500UL
#define RPM_GREEN_THRESHOLD     4000U
#define RPM_YELLOW_THRESHOLD    6000U
#define RPM_RED_THRESHOLD       7500U
#define OFFTRACK_FREQUENCY_HZ   2000U

#endif
