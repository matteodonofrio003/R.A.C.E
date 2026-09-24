#ifndef RACE_COCKPIT_CONTROLS_H
#define RACE_COCKPIT_CONTROLS_H
#include <stdint.h>

#define JOYSTICK_DEAD_ZONE 24
#define JOYSTICK_MIN_RAW 80
#define JOYSTICK_MAX_RAW 4015

/* Preserve 1% steps: one small hardware deadzone, rounded linear mapping. */
static inline int32_t joystick_map(uint16_t raw, int32_t center) {
  int32_t delta = (int32_t)raw - center;
  int32_t sign = delta < 0 ? -1 : 1;
  int32_t magnitude = (delta < 0 ? -delta : delta) - JOYSTICK_DEAD_ZONE;
  if (magnitude <= 0) return 0;
  int32_t span = (sign > 0 ? JOYSTICK_MAX_RAW - center :
                               center - JOYSTICK_MIN_RAW) - JOYSTICK_DEAD_ZONE;
  if (span <= 0) return 0;
  int32_t result = (magnitude * 100 + span / 2) / span;
  return sign * (result > 100 ? 100 : result);
}

typedef struct {
  uint8_t stable;
  uint8_t counts[2];
} ButtonDebouncer;

/* Only throttle and brake are sampled; each has independent debounce. */
static inline uint8_t buttons_update(ButtonDebouncer *state, uint8_t raw) {
  uint8_t previous = state->stable;
  for (unsigned i = 0; i < 2; i++) {
    uint8_t mask = (uint8_t)(1U << i);
    if ((raw & mask) == (state->stable & mask)) state->counts[i] = 0;
    else if (++state->counts[i] >= 4U) {
      state->stable ^= mask;
      state->counts[i] = 0;
    }
  }
  return state->stable & (uint8_t)~previous;
}
#endif
