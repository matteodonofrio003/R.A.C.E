#ifndef RACE_CLUSTER_TELEMETRY_PROTOCOL_H
#define RACE_CLUSTER_TELEMETRY_PROTOCOL_H

#include <Arduino.h>

#define TELEMETRY_HEADER 0xBDBDU

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint16_t rpm;
  float speed_kmh;
  int8_t steer;
  uint8_t reserved;
  uint8_t flags;
  uint16_t session;
  uint8_t crc;
} TelemetryPacket;

static_assert(sizeof(TelemetryPacket) == 14U, "Telemetry v3 layout");

uint8_t telemetryCalculateCrc(const uint8_t *data, size_t length);
bool telemetryPacketIsValid(const TelemetryPacket *packet);

#endif
