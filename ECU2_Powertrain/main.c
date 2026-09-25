#include "ch.h"
#include "hal.h"
#include "powertrain_app.h"

int main(void) {
  halInit();
  chSysInit();
  powertrainAppStart();
  while (true) chThdSleepMilliseconds(1000);
}
