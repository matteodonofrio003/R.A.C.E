#include "ch.h"
#include "hal.h"
#include "cockpit_receiver.h"
#include "feedback_receiver.h"
#include "powertrain_app.h"
#include "powertrain_config.h"
#include "telemetry_service.h"
#include "vehicle_dynamics.h"

static const SerialConfig ecu_config = {
  ECU_LINK_BAUD, 0U, USART_CR2_STOP1_BITS, 0U
};
static const SerialConfig telemetry_config = {
  TELEMETRY_LINK_BAUD, 0U, USART_CR2_STOP1_BITS, 0U
};

void powertrainAppStart(void) {
  palSetPadMode(GPIOC, 4U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOC, 5U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOA, 2U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOA, 3U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOB, 10U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOC, 10U, PAL_MODE_ALTERNATE(5));
  palSetPadMode(GPIOC, 11U, PAL_MODE_ALTERNATE(5));
  sdStart(&SD1, &ecu_config);
  sdStart(&SD2, &ecu_config);
  sdStart(&SD3, &telemetry_config);
  sdStart(&SD4, &telemetry_config);

  cockpitReceiverStart();
  feedbackReceiverStart();
  vehicleDynamicsStart();
  telemetryServiceStart();
}
