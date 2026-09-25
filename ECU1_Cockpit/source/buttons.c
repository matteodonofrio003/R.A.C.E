#include "ch.h"
#include "hal.h"
#include "buttons.h"
#include "cockpit_state.h"
#include "controls.h"

static THD_WORKING_AREA(wa_buttons, 256);
static THD_FUNCTION(ButtonsThread, arg) {
  ButtonDebouncer debounce = {0};
  (void)arg;

  for (unsigned i = 0U; i < 2U; i++) {
    palSetPadMode(GPIOC, i, PAL_MODE_INPUT_PULLUP);
  }
  while (true) {
    uint8_t raw = 0U;
    for (unsigned i = 0U; i < 2U; i++) {
      if (palReadPad(GPIOC, i) == PAL_LOW) raw |= (uint8_t)(1U << i);
    }
    (void)buttonsUpdate(&debounce, raw);
    cockpitStateSetButtons(raw, debounce.stable);
    chThdSleepMilliseconds(5);
  }
}

void buttonsStart(void) {
  chThdCreateStatic(wa_buttons, sizeof(wa_buttons), NORMALPRIO,
                    ButtonsThread, NULL);
}
