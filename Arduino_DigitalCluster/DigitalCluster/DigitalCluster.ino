/*
 * Distributed Automotive HIL Simulator - Arduino Digital Cluster
 *
 * Hardware connections:
 *   Arduino D10 (SoftwareSerial RX) <- STM32 telemetry TX (3.3 V)
 *   Arduino GND                     -- STM32 GND
 *   LCD 1602 I2C: SDA=A4, SCL=A5, address 0x27
 *   Shift lights: green=D6, yellow=D8, red=D9
 *   Piezo buzzer: D7
 *
 * SoftwareSerial requires a TX pin even though this application never
 * transmits. A0 is used as an unconnected dummy TX pin.
 */

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SoftwareSerial.h>

#define ECU_RX_PIN                 10U
#define ECU_UNUSED_TX_PIN          A0
#define LCD_I2C_ADDRESS            0x27U
#define LED_GREEN_PIN              6U
#define LED_YELLOW_PIN             8U
#define LED_RED_PIN                9U
#define BUZZER_PIN                 7U

#define ECU_BAUD_RATE              38400UL
#define TELEMETRY_HEADER           0xBBBBU
#define TELEMETRY_TIMEOUT_MS       500UL
#define SHIFT_GREEN_RPM            4000U
#define SHIFT_YELLOW_RPM           6000U
#define SHIFT_RED_RPM              7500U
#define LIMITER_RPM                7900U
#define LIMITER_FREQUENCY_HZ       2000U

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint16_t rpm;
  float speed_kmh;
  uint8_t crc;
} TelemetryPacket;

/*
 * The STM32G474RE and Arduino Uno are little-endian. The byte-stream parser
 * nevertheless searches for the 0xBB, 0xBB preamble, so it recovers after a
 * reset or a corrupted byte without relying on UART packet boundaries.
 */
static SoftwareSerial ecuSerial(ECU_RX_PIN, ECU_UNUSED_TX_PIN);
static LiquidCrystal_I2C lcd(LCD_I2C_ADDRESS, 16U, 2U);

static TelemetryPacket received_packet;
static uint8_t packet_index = 0U;
static bool telemetry_available = false;
static unsigned long last_valid_packet_ms = 0UL;

static uint8_t calculate_crc(const uint8_t *data, size_t length) {
  uint8_t crc = 0U;

  while (length > 0U) {
    crc ^= *data++;
    length--;
  }

  return crc;
}

static bool packet_is_valid(const TelemetryPacket *packet) {
  uint8_t expected_crc;

  if (packet->header != TELEMETRY_HEADER) {
    return false;
  }

  expected_crc = calculate_crc((const uint8_t *)packet,
                               sizeof(TelemetryPacket) - sizeof(packet->crc));
  return expected_crc == packet->crc;
}

static void write_display_line(uint8_t row, const char *text) {
  lcd.setCursor(0, row);
  lcd.print(text);
}

static void update_shift_lights_and_buzzer(uint16_t rpm) {
  digitalWrite(LED_GREEN_PIN, (rpm >= SHIFT_GREEN_RPM) ? HIGH : LOW);
  digitalWrite(LED_YELLOW_PIN, (rpm >= SHIFT_YELLOW_RPM) ? HIGH : LOW);
  digitalWrite(LED_RED_PIN, (rpm >= SHIFT_RED_RPM) ? HIGH : LOW);

  if (rpm >= LIMITER_RPM) {
    tone(BUZZER_PIN, LIMITER_FREQUENCY_HZ);
  }
  else {
    noTone(BUZZER_PIN);
  }
}

static void update_cluster(const TelemetryPacket *packet) {
  char speed_value[7];
  char line_0[17];
  char line_1[17];

  /*
   * A five-character speed field fits the 1602 LCD exactly, including the
   * 200.0 km/h maximum of the baseline powertrain model.
   */
  dtostrf(packet->speed_kmh, 5, 1, speed_value);
  snprintf(line_0, sizeof(line_0), "Speed:%s km/h", speed_value);
  snprintf(line_1, sizeof(line_1), "RPM: %4u       ", packet->rpm);

  /* Each line is always 16 characters: no lcd.clear(), hence no flicker. */
  write_display_line(0U, line_0);
  write_display_line(1U, line_1);
  update_shift_lights_and_buzzer(packet->rpm);
}

static void show_no_telemetry(void) {
  write_display_line(0U, "NO ECU DATA     ");
  write_display_line(1U, "Check UART link ");
  update_shift_lights_and_buzzer(0U);
}

static void handle_received_byte(uint8_t byte) {
  uint8_t *packet_bytes = (uint8_t *)&received_packet;

  if (packet_index == 0U) {
    if (byte == 0xBBU) {
      packet_bytes[packet_index++] = byte;
    }
    return;
  }

  if (packet_index == 1U) {
    if (byte == 0xBBU) {
      packet_bytes[packet_index++] = byte;
    }
    else {
      packet_index = 0U;
    }
    return;
  }

  packet_bytes[packet_index++] = byte;
  if (packet_index == sizeof(TelemetryPacket)) {
    if (packet_is_valid(&received_packet)) {
      telemetry_available = true;
      last_valid_packet_ms = millis();
      update_cluster(&received_packet);
    }

    packet_index = 0U;
  }
}

static void process_telemetry(void) {
  while (ecuSerial.available() > 0) {
    handle_received_byte((uint8_t)ecuSerial.read());
  }
}

static void check_telemetry_timeout(void) {
  if (telemetry_available &&
      ((millis() - last_valid_packet_ms) > TELEMETRY_TIMEOUT_MS)) {
    telemetry_available = false;
    show_no_telemetry();
  }
}

void setup(void) {
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
  show_no_telemetry();

  ecuSerial.begin(ECU_BAUD_RATE);
}

void loop(void) {
  process_telemetry();
  check_telemetry_timeout();
}
