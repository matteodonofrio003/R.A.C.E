#include <assert.h>
#include <stdio.h>
#include "../ECU1_Cockpit/include/controls.h"

int main(void) {
  ButtonDebouncer buttons = {0};
  for (unsigned i=0; i<4; i++) buttonsUpdate(&buttons, 1U | (i & 1U) * 2U);
  assert((buttons.stable & 1U) != 0U);
  assert((buttons.stable & 2U) == 0U);
  for (unsigned i=0; i<4; i++) buttonsUpdate(&buttons, 3U);
  assert(buttons.stable == 3U);
  for (unsigned i=0; i<4; i++) buttonsUpdate(&buttons, 0U);
  assert(buttons.stable == 0U);
  assert(joystickMap(2048,2048) == 0);
  assert(joystickMap(2088,2048) == 1);
  assert(joystickMap(2008,2048) == -1);
  assert(joystickMap(0,2048) == -100);
  assert(joystickMap(4095,2048) == 100);
  int32_t previous = -100;
  unsigned changes = 0;
  for (unsigned raw=0; raw<4096; raw++) {
    int32_t value = joystickMap((uint16_t)raw,2048);
    assert(value >= previous && value >= -100 && value <= 100);
    if (value != previous) changes++;
    previous = value;
  }
  assert(changes == 200);
  puts("PASS: 201 steering values and independent throttle/brake debounce.");
  return 0;
}
