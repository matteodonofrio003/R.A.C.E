#include "ch.h"
#include "cockpit_config.h"
#include "cockpit_state.h"

static CockpitStateSnapshot state = {
  .joystick_center = JOYSTICK_DEFAULT_CENTER
};

void cockpitStateSetJoystick(int32_t steer, int32_t center,
                             uint16_t selected_raw, uint16_t raw_x,
                             uint16_t raw_y) {
  chSysLock();
  state.steer = steer;
  state.joystick_center = center;
  state.steering_raw = selected_raw;
  state.joystick_raw_x = raw_x;
  state.joystick_raw_y = raw_y;
  chSysUnlock();
}

void cockpitStateSetButtons(uint8_t raw, uint8_t stable) {
  chSysLock();
  state.buttons_raw = raw;
  state.buttons_stable = stable;
  state.button_state = stable & 3U;
  state.pedal = (stable & 2U) ? -100 : ((stable & 1U) ? 100 : 0);
  chSysUnlock();
}

void cockpitStateGetSnapshot(CockpitStateSnapshot *snapshot) {
  chSysLock();
  *snapshot = state;
  chSysUnlock();
}
