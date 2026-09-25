#ifndef RACE_COCKPIT_CONTROLS_H
#define RACE_COCKPIT_CONTROLS_H

#include <stdint.h>

#define JOYSTICK_DEAD_ZONE 24
#define JOYSTICK_MIN_RAW   80
#define JOYSTICK_MAX_RAW   4015

typedef struct {
  uint8_t stable;
  uint8_t counts[2];
} ButtonDebouncer;

int32_t joystickMap(uint16_t raw, int32_t center);
uint8_t buttonsUpdate(ButtonDebouncer *state, uint8_t raw);

#endif
