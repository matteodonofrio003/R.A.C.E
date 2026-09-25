#include "ch.h"
#include "powertrain_config.h"
#include "powertrain_state.h"
#include "vehicle_dynamics.h"

#define CLAMP(value, minimum, maximum) \
  (((value) < (minimum)) ? (minimum) : \
   (((value) > (maximum)) ? (maximum) : (value)))

static THD_WORKING_AREA(wa_physics, 512);
static THD_FUNCTION(PhysicsThread, arg) {
  float speed = 0.0f;
  float rpm = 1000.0f;
  bool release_required = false;
  systime_t reset_time = 0U;
  systime_t tick = chVTGetSystemTimeX();
  (void)arg;

  while (true) {
    DynamicsInput input;
    int8_t pedal;
    powertrainStateGetDynamicsInput(&input);
    pedal = input.pedal;
    if (input.requested_session != input.applied_session) {
      speed = 0.0f;
      rpm = 1000.0f;
      release_required = true;
      reset_time = chVTGetSystemTimeX();
    }
    if (release_required) {
      speed = 0.0f;
      rpm = 1000.0f;
      if (input.fresh && !input.throttle_pressed &&
          (chVTTimeElapsedSinceX(reset_time) >= TIME_MS2I(250))) {
        release_required = false;
      }
      pedal = 0;
    }

    float drag = 0.9f + 0.00003f * speed * speed;
    float drive = ((pedal > 0) && (speed < VEHICLE_SPEED_LIMIT_KMH)) ?
      38.0f - 27.0f * speed / VEHICLE_SPEED_LIMIT_KMH : 0.0f;
    float rpm_target;
    speed += (drive - drag - ((pedal < 0) ? 65.0f : 0.0f)) * 0.01f;
    speed = CLAMP(speed, 0.0f, VEHICLE_SPEED_LIMIT_KMH);
    rpm_target = CLAMP(1000.0f + speed / VEHICLE_SPEED_LIMIT_KMH * 7000.0f,
                       1000.0f, 8000.0f);
    rpm += CLAMP(rpm_target - rpm, -100.0f, 80.0f);
    powertrainStatePublishDynamics((uint16_t)rpm, speed,
                                   input.requested_session);
    tick = chThdSleepUntilWindowed(tick,
                                   tick + TIME_MS2I(PHYSICS_PERIOD_MS));
  }
}

void vehicleDynamicsStart(void) {
  chThdCreateStatic(wa_physics, sizeof(wa_physics), HIGHPRIO,
                    PhysicsThread, NULL);
}
