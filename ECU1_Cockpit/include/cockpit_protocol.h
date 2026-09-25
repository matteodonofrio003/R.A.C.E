#ifndef RACE_COCKPIT_PROTOCOL_H
#define RACE_COCKPIT_PROTOCOL_H

#include <stddef.h>
#include <stdint.h>

#define COCKPIT_PACKET_HEADER 0xAAAAU
#define COCKPIT_PACKET_MSG_ID 0x010BU

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint16_t msg_id;
  int8_t steer_val;
  uint8_t buttons;
  uint8_t reserved;
  uint8_t crc;
} CockpitPacket;

_Static_assert(sizeof(CockpitPacket) == 8U, "Cockpit v2 frame size");

uint8_t cockpitCalculateCrc(const void *frame, size_t size);

#endif
