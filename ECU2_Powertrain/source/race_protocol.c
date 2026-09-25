#include "race_protocol.h"

uint8_t raceCalculateCrc(const void *frame, size_t size) {
  const uint8_t *bytes = frame;
  uint8_t crc = 0U;

  while (size > 1U) {
    crc ^= *bytes++;
    size--;
  }
  return crc;
}

bool cockpitPacketIsValid(const CockpitPacket *packet) {
  return (packet->header == COCKPIT_HEADER) &&
         (packet->msg_id == COCKPIT_ID) &&
         (packet->steer >= -100) && (packet->steer <= 100) &&
         (packet->buttons <= 3U) && (packet->reserved == 1U) &&
         (raceCalculateCrc(packet, sizeof(*packet)) == packet->crc);
}

bool feedbackPacketIsValid(const FeedbackPacket *packet) {
  return (packet->header == FEEDBACK_HEADER) &&
         (packet->offtrack <= 1U) &&
         (raceCalculateCrc(packet, sizeof(*packet)) == packet->crc);
}

void telemetryPacketFinalize(TelemetryPacket *packet) {
  packet->header = TELEMETRY_HEADER;
  packet->crc = raceCalculateCrc(packet, sizeof(*packet));
}
