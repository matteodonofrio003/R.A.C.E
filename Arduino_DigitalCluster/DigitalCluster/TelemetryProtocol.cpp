#include <math.h>
#include "TelemetryProtocol.h"

uint8_t telemetryCalculateCrc(const uint8_t *data, size_t length) {
  uint8_t crc = 0U;
  while (length > 0U) {
    crc ^= *data++;
    length--;
  }
  return crc;
}

bool telemetryPacketIsValid(const TelemetryPacket *packet) {
  uint8_t expected = telemetryCalculateCrc((const uint8_t *)packet,
    sizeof(TelemetryPacket) - sizeof(packet->crc));
  return (packet->header == TELEMETRY_HEADER) &&
         (expected == packet->crc) && isfinite(packet->speed_kmh) &&
         (packet->speed_kmh >= 0.0f) && (packet->speed_kmh <= 360.0f) &&
         (packet->rpm >= 1000U) && (packet->rpm <= 8000U) &&
         (packet->reserved == 1U) &&
         (packet->steer >= -100) && (packet->steer <= 100) &&
         (packet->flags <= 7U);
}
