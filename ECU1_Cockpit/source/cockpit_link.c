#include "ch.h"
#include "hal.h"
#include "cockpit_config.h"
#include "cockpit_link.h"
#include "cockpit_protocol.h"
#include "cockpit_state.h"

static THD_WORKING_AREA(wa_cockpit_tx, 256);
static THD_FUNCTION(CockpitTxThread, arg) {
  CockpitPacket packet;
  (void)arg;

  while (true) {
    CockpitStateSnapshot snapshot;
    cockpitStateGetSnapshot(&snapshot);
    packet.header = COCKPIT_PACKET_HEADER;
    packet.msg_id = COCKPIT_PACKET_MSG_ID;
    packet.steer_val = (int8_t)snapshot.steer;
    packet.buttons = snapshot.button_state;
    packet.reserved = 1U;
    packet.crc = cockpitCalculateCrc(&packet, sizeof(packet));
    (void)chnWriteTimeout(&SD1, (const uint8_t *)&packet, sizeof(packet),
                          TIME_MS2I(2));
    chThdSleepMilliseconds(COCKPIT_PERIOD_MS);
  }
}

void cockpitLinkStart(void) {
  chThdCreateStatic(wa_cockpit_tx, sizeof(wa_cockpit_tx), NORMALPRIO,
                    CockpitTxThread, NULL);
}
