#include "ch.h"
#include "hal.h"
#include <string.h>
#include "feedback_receiver.h"
#include "powertrain_state.h"
#include "race_protocol.h"

static THD_WORKING_AREA(wa_feedback, 384);
static THD_FUNCTION(FeedbackThread, arg) {
  FeedbackPacket packet;
  size_t used = 0U;
  (void)arg;

  while (true) {
    uint8_t byte;
    if (chnReadTimeout(&SD4, &byte, 1U, TIME_MS2I(20)) != 1U) {
      used = 0U;
      continue;
    }
    ((uint8_t *)&packet)[used++] = byte;
    if (used != sizeof(packet)) continue;
    if (feedbackPacketIsValid(&packet)) {
      powertrainStateAcceptFeedback(packet.offtrack != 0U, packet.session);
      used = 0U;
    }
    else {
      memmove(&packet, ((uint8_t *)&packet) + 1U, sizeof(packet) - 1U);
      used--;
    }
  }
}

void feedbackReceiverStart(void) {
  chThdCreateStatic(wa_feedback, sizeof(wa_feedback), NORMALPRIO,
                    FeedbackThread, NULL);
}
