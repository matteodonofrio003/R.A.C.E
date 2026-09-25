#ifndef RACE_COCKPIT_STATE_H
#define RACE_COCKPIT_STATE_H

#include <stdint.h>

typedef struct {
  int32_t steer;
  int32_t pedal;
  int32_t joystick_center;
  uint16_t steering_raw;
  uint16_t joystick_raw_x;
  uint16_t joystick_raw_y;
  uint8_t button_state;
  uint8_t buttons_raw;
  uint8_t buttons_stable;
} CockpitStateSnapshot;

void cockpitStateSetJoystick(int32_t steer, int32_t center,
                             uint16_t selected_raw, uint16_t raw_x,
                             uint16_t raw_y);
void cockpitStateSetButtons(uint8_t raw, uint8_t stable);
void cockpitStateGetSnapshot(CockpitStateSnapshot *snapshot);

#endif
