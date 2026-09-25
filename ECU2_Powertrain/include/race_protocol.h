#ifndef RACE_POWERTRAIN_PROTOCOL_H
#define RACE_POWERTRAIN_PROTOCOL_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define COCKPIT_HEADER   0xAAAAU
#define COCKPIT_ID       0x010BU
#define TELEMETRY_HEADER 0xBDBDU
#define FEEDBACK_HEADER  0xCDCDU

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint16_t msg_id;
  int8_t steer;
  uint8_t buttons;
  uint8_t reserved;
  uint8_t crc;
} CockpitPacket;

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint16_t rpm;
  float speed_kmh;
  int8_t steer;
  uint8_t gear;
  uint8_t flags;
  uint16_t session;
  uint8_t crc;
} TelemetryPacket;

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint8_t offtrack;
  uint16_t session;
  uint8_t crc;
} FeedbackPacket;

_Static_assert(sizeof(CockpitPacket) == 8U, "Cockpit v2 layout");
_Static_assert(sizeof(TelemetryPacket) == 14U, "Telemetry v3 layout");
_Static_assert(sizeof(FeedbackPacket) == 6U, "Feedback v3 layout");

uint8_t raceCalculateCrc(const void *frame, size_t size);
bool cockpitPacketIsValid(const CockpitPacket *packet);
bool feedbackPacketIsValid(const FeedbackPacket *packet);
void telemetryPacketFinalize(TelemetryPacket *packet);

#endif
