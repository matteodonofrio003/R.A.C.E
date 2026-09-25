#include "controls.h"

int32_t joystickMap(uint16_t raw, int32_t center) {
  int32_t delta = (int32_t)raw - center;
  int32_t sign = delta < 0 ? -1 : 1;
  int32_t magnitude = (delta < 0 ? -delta : delta) - JOYSTICK_DEAD_ZONE;
  int32_t span;
  int32_t result;

  if (magnitude <= 0) return 0;
  span = (sign > 0 ? JOYSTICK_MAX_RAW - center :
                     center - JOYSTICK_MIN_RAW) - JOYSTICK_DEAD_ZONE;
  if (span <= 0) return 0;
  result = (magnitude * 100 + span / 2) / span;
  return sign * (result > 100 ? 100 : result);
}

uint8_t buttonsUpdate(ButtonDebouncer *state, uint8_t raw) {
  uint8_t previous = state->stable;

  for (unsigned i = 0U; i < 2U; i++) {
    uint8_t mask = (uint8_t)(1U << i);
    if ((raw & mask) == (state->stable & mask)) state->counts[i] = 0U;
    else if (++state->counts[i] >= 4U) {
      state->stable ^= mask;
      state->counts[i] = 0U;
    }
  }
  return state->stable & (uint8_t)~previous;
}
