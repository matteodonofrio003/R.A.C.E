#include "powertrain_config.h"
#include "powertrain_state.h"

typedef struct {
  int8_t target_steer;
  int8_t target_pedal;
  bool throttle_pressed;
  bool cockpit_seen;
  bool feedback_seen;
  bool game_offtrack;
  uint16_t engine_rpm;
  uint16_t requested_session;
  uint16_t applied_session;
  float vehicle_speed_kmh;
  systime_t cockpit_time;
  systime_t feedback_time;
  uint32_t valid_packets;
  uint32_t invalid_packets;
} SharedState;

static SharedState state = {.engine_rpm = 1000U};

void powertrainStateAcceptCockpit(int8_t steer, uint8_t buttons) {
  chSysLock();
  state.target_steer = steer;
  state.target_pedal = (buttons & 2U) ? -100 : ((buttons & 1U) ? 100 : 0);
  state.throttle_pressed = (buttons & 1U) != 0U;
  state.cockpit_time = chVTGetSystemTimeX();
  state.cockpit_seen = true;
  state.valid_packets++;
  chSysUnlock();
}

void powertrainStateRejectCockpit(void) {
  chSysLock();
  state.invalid_packets++;
  chSysUnlock();
}

void powertrainStateAcceptFeedback(bool offtrack, uint16_t session) {
  chSysLock();
  state.game_offtrack = offtrack;
  state.requested_session = session;
  state.feedback_time = chVTGetSystemTimeX();
  state.feedback_seen = true;
  chSysUnlock();
}

void powertrainStateGetDynamicsInput(DynamicsInput *input) {
  chSysLock();
  input->fresh = state.cockpit_seen &&
    (chVTTimeElapsedSinceX(state.cockpit_time) < TIME_MS2I(COCKPIT_TIMEOUT_MS));
  input->pedal = input->fresh ? state.target_pedal : -100;
  input->throttle_pressed = state.throttle_pressed;
  input->requested_session = state.requested_session;
  input->applied_session = state.applied_session;
  chSysUnlock();
}

void powertrainStatePublishDynamics(uint16_t rpm, float speed_kmh,
                                    uint16_t applied_session) {
  chSysLock();
  state.engine_rpm = rpm;
  state.vehicle_speed_kmh = speed_kmh;
  state.applied_session = applied_session;
  chSysUnlock();
}

void powertrainStateGetTelemetry(TelemetryState *snapshot) {
  chSysLock();
  snapshot->cockpit_fresh = state.cockpit_seen &&
    (chVTTimeElapsedSinceX(state.cockpit_time) < TIME_MS2I(COCKPIT_TIMEOUT_MS));
  snapshot->feedback_fresh = state.feedback_seen &&
    (chVTTimeElapsedSinceX(state.feedback_time) < TIME_MS2I(FEEDBACK_TIMEOUT_MS));
  snapshot->offtrack = snapshot->feedback_fresh && state.game_offtrack;
  snapshot->steer = snapshot->cockpit_fresh ? state.target_steer : 0;
  snapshot->pedal = snapshot->cockpit_fresh ? state.target_pedal : 0;
  snapshot->rpm = state.engine_rpm;
  snapshot->speed_kmh = state.vehicle_speed_kmh;
  snapshot->session = state.applied_session;
  snapshot->valid_packets = state.valid_packets;
  snapshot->invalid_packets = state.invalid_packets;
  chSysUnlock();
}
