#include "ch.h"
#include "hal.h"
#include <string.h>
#include "cockpit_receiver.h"
#include "powertrain_state.h"
#include "race_protocol.h"

static THD_WORKING_AREA(wa_receiver, 384);
static THD_FUNCTION(ReceiverThread, arg) {
  CockpitPacket packet;
  size_t used = 0U;
  (void)arg;

  while (true) {
    uint8_t byte;
    if (chnReadTimeout(&SD1, &byte, 1U, TIME_MS2I(20)) != 1U) {
      used = 0U;
      continue;
    }
    ((uint8_t *)&packet)[used++] = byte;
    if (used != sizeof(packet)) continue;
    if (cockpitPacketIsValid(&packet)) {
      powertrainStateAcceptCockpit(packet.steer, packet.buttons);
      used = 0U;
    }
    else {
      powertrainStateRejectCockpit();
      memmove(&packet, ((uint8_t *)&packet) + 1U, sizeof(packet) - 1U);
      used--;
    }
  }
}

void cockpitReceiverStart(void) {
  chThdCreateStatic(wa_receiver, sizeof(wa_receiver), NORMALPRIO,
                    ReceiverThread, NULL);
}
