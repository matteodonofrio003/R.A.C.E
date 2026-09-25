#include <Arduino.h>
#include <SoftwareSerial.h>
#include <string.h>
#include "ClusterConfig.h"
#include "ClusterDisplay.h"
#include "TelemetryProtocol.h"
#include "TelemetryReceiver.h"

static SoftwareSerial ecu_serial(ECU_RX_PIN, ECU_UNUSED_TX_PIN);
static TelemetryPacket received_packet;
static uint8_t packet_index;
static bool telemetry_available;
static unsigned long last_valid_packet_ms;
static unsigned long last_byte_ms;

static void processByte(uint8_t byte) {
  uint8_t *bytes = (uint8_t *)&received_packet;
  bytes[packet_index++] = byte;
  if (packet_index != sizeof(TelemetryPacket)) return;
  if (telemetryPacketIsValid(&received_packet)) {
    telemetry_available = true;
    last_valid_packet_ms = millis();
    clusterDisplayUpdate(&received_packet);
    packet_index = 0U;
  }
  else {
    memmove(bytes, bytes + 1U, sizeof(TelemetryPacket) - 1U);
    packet_index--;
  }
}

void telemetryReceiverBegin(void) {
  ecu_serial.begin(ECU_BAUD_RATE);
}

void telemetryReceiverPoll(void) {
  if ((millis() - last_byte_ms) > 30UL) packet_index = 0U;
  while (ecu_serial.available() > 0) {
    last_byte_ms = millis();
    processByte((uint8_t)ecu_serial.read());
  }
  if (telemetry_available &&
      ((millis() - last_valid_packet_ms) > TELEMETRY_TIMEOUT_MS)) {
    telemetry_available = false;
    clusterDisplayShowNoTelemetry();
  }
}
