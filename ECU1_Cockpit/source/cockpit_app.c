#include "ch.h"
#include "hal.h"
#include "buttons.h"
#include "cockpit_app.h"
#include "cockpit_config.h"
#include "cockpit_diagnostics.h"
#include "cockpit_link.h"
#include "joystick.h"

static const SerialConfig serial_config = {
  COCKPIT_SERIAL_BAUD, 0U, USART_CR2_STOP1_BITS, 0U
};

void cockpitAppStart(void) {
  palSetPadMode(GPIOC, 4U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOC, 5U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOA, 2U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOA, 3U, PAL_MODE_ALTERNATE(7));
  sdStart(&SD1, &serial_config);
  sdStart(&SD2, &serial_config);
  joystickStart();
  buttonsStart();
  cockpitLinkStart();
  cockpitDiagnosticsStart();
}
