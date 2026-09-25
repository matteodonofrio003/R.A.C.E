#include "ch.h"
#include "hal.h"
#include "chprintf.h"
#include "cockpit_diagnostics.h"
#include "cockpit_state.h"

static THD_WORKING_AREA(wa_diagnostics, 384);
static THD_FUNCTION(DiagnosticsThread, arg) {
  (void)arg;
  while (true) {
    CockpitStateSnapshot snapshot;
    cockpitStateGetSnapshot(&snapshot);
    chprintf((BaseSequentialStream *)&SD2,
             "steer=%ld pedal=%ld raw=%u center=%ld X=%u Y=%u axis=Y/PA1 buttons=%x/%x\r\n",
             (long)snapshot.steer, (long)snapshot.pedal,
             (unsigned)snapshot.steering_raw,
             (long)snapshot.joystick_center,
             (unsigned)snapshot.joystick_raw_x,
             (unsigned)snapshot.joystick_raw_y,
             (unsigned)snapshot.buttons_raw,
             (unsigned)snapshot.buttons_stable);
    chThdSleepMilliseconds(100);
  }
}

void cockpitDiagnosticsStart(void) {
  chThdCreateStatic(wa_diagnostics, sizeof(wa_diagnostics), LOWPRIO,
                    DiagnosticsThread, NULL);
}
