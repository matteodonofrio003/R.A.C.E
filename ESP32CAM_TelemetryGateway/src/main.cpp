#include <Arduino.h>
#include "GatewayApp.h"

#ifdef PLATFORMIO
void setup(void) {
  gatewaySetup();
}

void loop(void) {
  gatewayLoop();
}
#endif
