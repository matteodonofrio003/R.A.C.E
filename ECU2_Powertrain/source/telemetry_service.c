#include "ch.h"
#include "hal.h"
#include "chprintf.h"
#include "powertrain_config.h"
#include "powertrain_state.h"
#include "race_protocol.h"
#include "telemetry_service.h"

static THD_WORKING_AREA(wa_telemetry, 768);
static THD_FUNCTION(TelemetryThread, arg) {
  unsigned cluster_divider = 0U;
  systime_t tick = chVTGetSystemTimeX();
  (void)arg;

  while (true) {
    TelemetryPacket packet;
    TelemetryState state;
    powertrainStateGetTelemetry(&state);
    packet.rpm = state.rpm;
    packet.speed_kmh = state.speed_kmh;
    packet.steer = state.steer;
    packet.gear = 1U;
    packet.flags = (state.offtrack ? 1U : 0U) |
                   (state.cockpit_fresh ? 2U : 0U) |
                   (state.feedback_fresh ? 4U : 0U);
    packet.session = state.session;
    telemetryPacketFinalize(&packet);
    (void)chnWriteTimeout(&SD4, (const uint8_t *)&packet, sizeof(packet),
                          TIME_MS2I(5));
    if (cluster_divider++ == 0U) {
      (void)chnWriteTimeout(&SD3, (const uint8_t *)&packet, sizeof(packet),
                            TIME_MS2I(5));
      chprintf((BaseSequentialStream *)&SD2,
               "Pedal:%d Steer:%d RPM:%u Speed:%.1f RX:%lu/%lu Alarm:%u FB:%u Session:%u\r\n",
               state.pedal, packet.steer, packet.rpm,
               (double)packet.speed_kmh,
               (unsigned long)state.valid_packets,
               (unsigned long)state.invalid_packets,
               state.offtrack, state.feedback_fresh, packet.session);
    }
    if (cluster_divider >= 5U) cluster_divider = 0U;
    tick = chThdSleepUntilWindowed(tick,
                                   tick + TIME_MS2I(TELEMETRY_PERIOD_MS));
  }
}

void telemetryServiceStart(void) {
  chThdCreateStatic(wa_telemetry, sizeof(wa_telemetry), LOWPRIO,
                    TelemetryThread, NULL);
}
