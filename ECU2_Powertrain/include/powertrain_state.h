#ifndef RACE_POWERTRAIN_STATE_H
#define RACE_POWERTRAIN_STATE_H

#include "ch.h"
#include <stdbool.h>
#include <stdint.h>

typedef struct {
  bool fresh;
  bool throttle_pressed;
  int8_t pedal;
  uint16_t requested_session;
  uint16_t applied_session;
} DynamicsInput;

typedef struct {
  bool cockpit_fresh;
  bool feedback_fresh;
  bool offtrack;
  int8_t steer;
  int8_t pedal;
  uint16_t rpm;
  uint16_t session;
  float speed_kmh;
  uint32_t valid_packets;
  uint32_t invalid_packets;
} TelemetryState;

void powertrainStateAcceptCockpit(int8_t steer, uint8_t buttons);
void powertrainStateRejectCockpit(void);
void powertrainStateAcceptFeedback(bool offtrack, uint16_t session);
void powertrainStateGetDynamicsInput(DynamicsInput *input);
void powertrainStatePublishDynamics(uint16_t rpm, float speed_kmh,
                                    uint16_t applied_session);
void powertrainStateGetTelemetry(TelemetryState *snapshot);

#endif
