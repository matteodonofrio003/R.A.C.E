#include "cockpit_protocol.h"

uint8_t cockpitCalculateCrc(const void *frame, size_t size) {
  const uint8_t *bytes = frame;
  uint8_t crc = 0U;

  while (size > 1U) {
    crc ^= *bytes++;
    size--;
  }
  return crc;
}
