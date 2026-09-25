#include "ch.h"
#include "hal.h"
#include "cockpit_app.h"

int main(void) {
  halInit();
  chSysInit();
  cockpitAppStart();
  while (true) chThdSleepMilliseconds(1000);
}
