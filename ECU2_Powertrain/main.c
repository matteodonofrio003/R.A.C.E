#include "ch.h"
#include "hal.h"
#include "chprintf.h"
#include <string.h>

#define COCKPIT_HEADER 0xAAAAU
#define COCKPIT_ID 0x010BU
#define TELEMETRY_HEADER 0xBDBDU
#define FEEDBACK_HEADER 0xCDCDU
#define CLAMP(v, lo, hi) (((v) < (lo)) ? (lo) : (((v) > (hi)) ? (hi) : (v)))

typedef struct __attribute__((packed)) {
  uint16_t header, msg_id;
  int8_t steer;
  uint8_t buttons, reserved, crc;
} CockpitPacket;

typedef struct __attribute__((packed)) {
  uint16_t header, rpm;
  float speed_kmh;
  int8_t steer;
  uint8_t gear, flags;
  uint16_t session;
  uint8_t crc;
} TelemetryPacket;

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint8_t offtrack;
  uint16_t session;
  uint8_t crc;
} FeedbackPacket;

_Static_assert(sizeof(CockpitPacket) == 8U, "Cockpit v2 layout");
_Static_assert(sizeof(TelemetryPacket) == 14U, "Telemetry v3 layout");
_Static_assert(sizeof(FeedbackPacket) == 6U, "Feedback v3 layout");

volatile int8_t target_steer, target_pedal;
volatile uint16_t engine_rpm = 1000U;
volatile float vehicle_speed_kmh = 0.0f;
static bool cockpit_seen, feedback_seen, game_offtrack;
static bool throttle_pressed;
static uint16_t requested_session, applied_session;
static systime_t cockpit_time, feedback_time;
static uint32_t valid_packets, invalid_packets;
static const SerialConfig ecu_config = {115200U, 0U, USART_CR2_STOP1_BITS, 0U};
static const SerialConfig telemetry_config = {38400U, 0U, USART_CR2_STOP1_BITS, 0U};

static uint8_t calculate_crc(const void *frame, size_t size) {
  const uint8_t *bytes = frame;
  uint8_t crc = 0U;
  for (size_t i = 0; i < size - 1U; i++) crc ^= bytes[i];
  return crc;
}

/* Sliding windows recover from inserted/lost bytes, including embedded headers. */
static THD_WORKING_AREA(wa_receiver, 384);
static THD_FUNCTION(Receiver, arg) {
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
    if ((packet.header == COCKPIT_HEADER) && (packet.msg_id == COCKPIT_ID) &&
        (packet.steer >= -100) && (packet.steer <= 100) &&
        (packet.buttons <= 3U) && (packet.reserved == 1U) &&
        (calculate_crc(&packet, sizeof(packet)) == packet.crc)) {
      chSysLock();
      target_steer = packet.steer;
      target_pedal = (packet.buttons & 2U) ? -100 : ((packet.buttons & 1U) ? 100 : 0);
      throttle_pressed = (packet.buttons & 1U) != 0U;
      cockpit_time = chVTGetSystemTimeX();
      cockpit_seen = true;
      valid_packets++;
      chSysUnlock();
      used = 0U;
    }
    else {
      chSysLock();
      invalid_packets++;
      chSysUnlock();
      memmove(&packet, ((uint8_t *)&packet) + 1U, sizeof(packet) - 1U);
      used--;
    }
  }
}

static THD_WORKING_AREA(wa_feedback, 384);
static THD_FUNCTION(FeedbackReceiver, arg) {
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
    if ((packet.header == FEEDBACK_HEADER) && (packet.offtrack <= 1U) &&
        (calculate_crc(&packet, sizeof(packet)) == packet.crc)) {
      chSysLock();
      game_offtrack = packet.offtrack != 0U;
      requested_session = packet.session;
      feedback_time = chVTGetSystemTimeX();
      feedback_seen = true;
      chSysUnlock();
      used = 0U;
    }
    else {
      memmove(&packet, ((uint8_t *)&packet) + 1U, sizeof(packet) - 1U);
      used--;
    }
  }
}

static THD_WORKING_AREA(wa_physics, 512);
static THD_FUNCTION(Physics, arg) {
  const float speed_limit = 360.0f;
  float speed = 0.0f, rpm = 1000.0f;
  bool release_required = false;
  systime_t reset_time = 0U;
  systime_t tick = chVTGetSystemTimeX();
  (void)arg;
  while (true) {
    int8_t pedal;
    bool fresh;
    bool throttle;
    uint16_t reset_request, reset_applied;
    chSysLock();
    fresh = cockpit_seen && (chVTTimeElapsedSinceX(cockpit_time) < TIME_MS2I(250));
    pedal = fresh ? target_pedal : -100;
    throttle = throttle_pressed;
    reset_request = requested_session;
    reset_applied = applied_session;
    chSysUnlock();

    if (reset_request != reset_applied) {
      speed = 0.0f;
      rpm = 1000.0f;
      release_required = true;
      reset_time = chVTGetSystemTimeX();
    }
    /* A held throttle cannot carry acceleration into a new session. */
    if (release_required) {
      speed = 0.0f;
      rpm = 1000.0f;
      if (fresh && !throttle &&
          (chVTTimeElapsedSinceX(reset_time) >= TIME_MS2I(250))) release_required = false;
      pedal = 0;
    }

    /* Continuous single-ratio model. Units: km/h and km/h/s. */
    float drag = 0.9f + 0.00003f * speed * speed;
    float drive = ((pedal > 0) && (speed < speed_limit)) ?
                  38.0f - 27.0f * speed / speed_limit : 0.0f;
    speed += (drive - drag - ((pedal < 0) ? 65.0f : 0.0f)) * 0.01f;
    speed = CLAMP(speed, 0.0f, speed_limit);
    float rpm_target = CLAMP(1000.0f + speed / speed_limit * 7000.0f,
                             1000.0f, 8000.0f);
    rpm += CLAMP(rpm_target - rpm, -100.0f, 80.0f);
    chSysLock();
    engine_rpm = (uint16_t)rpm;
    vehicle_speed_kmh = speed;
    applied_session = reset_request;
    chSysUnlock();
    tick = chThdSleepUntilWindowed(tick, tick + TIME_MS2I(10));
  }
}

static THD_WORKING_AREA(wa_telemetry, 768);
static THD_FUNCTION(Telemetry, arg) {
  unsigned cluster_divider = 0U;
  systime_t tick = chVTGetSystemTimeX();
  (void)arg;
  while (true) {
    TelemetryPacket packet;
    int8_t pedal;
    uint32_t good, bad;
    chSysLock();
    bool fresh = cockpit_seen && (chVTTimeElapsedSinceX(cockpit_time) < TIME_MS2I(250));
    bool return_fresh = feedback_seen &&
                        (chVTTimeElapsedSinceX(feedback_time) < TIME_MS2I(500));
    bool offtrack = return_fresh && game_offtrack;
    packet.rpm = engine_rpm;
    packet.speed_kmh = vehicle_speed_kmh;
    packet.steer = fresh ? target_steer : 0;
    packet.gear = 1U; /* Reserved wire byte; no shift logic remains. */
    packet.flags = (offtrack ? 1U : 0U) | (fresh ? 2U : 0U) |
                   (return_fresh ? 4U : 0U);
    packet.session = applied_session;
    pedal = fresh ? target_pedal : 0;
    good = valid_packets;
    bad = invalid_packets;
    chSysUnlock();
    packet.header = TELEMETRY_HEADER;
    packet.crc = calculate_crc(&packet, sizeof(packet));
    (void)chnWriteTimeout(&SD4, (const uint8_t *)&packet, sizeof(packet), TIME_MS2I(5));
    /* Gateway steering at 50 Hz; LCD/debug stay at 10 Hz. Wire layout is unchanged. */
    if (cluster_divider++ == 0U) {
      (void)chnWriteTimeout(&SD3, (const uint8_t *)&packet, sizeof(packet), TIME_MS2I(5));
      chprintf((BaseSequentialStream *)&SD2,
               "Pedal:%d Steer:%d RPM:%u Speed:%.1f RX:%lu/%lu Alarm:%u FB:%u Session:%u\r\n",
               pedal, packet.steer, packet.rpm, (double)packet.speed_kmh,
               (unsigned long)good, (unsigned long)bad, offtrack, return_fresh, packet.session);
    }
    if (cluster_divider >= 5U) cluster_divider = 0U;
    tick = chThdSleepUntilWindowed(tick, tick + TIME_MS2I(20));
  }
}

int main(void) {
  halInit();
  chSysInit();
  palSetPadMode(GPIOC, 4U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOC, 5U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOA, 2U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOA, 3U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOB, 10U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOC, 10U, PAL_MODE_ALTERNATE(5));
  /* UART4 RX: ESP32 GPIO14 -> PC11. Both endpoints use 3.3 V logic. */
  palSetPadMode(GPIOC, 11U, PAL_MODE_ALTERNATE(5));
  sdStart(&SD1, &ecu_config);
  sdStart(&SD2, &ecu_config);
  sdStart(&SD3, &telemetry_config);
  sdStart(&SD4, &telemetry_config);
  chThdCreateStatic(wa_receiver, sizeof(wa_receiver), NORMALPRIO, Receiver, NULL);
  chThdCreateStatic(wa_feedback, sizeof(wa_feedback), NORMALPRIO, FeedbackReceiver, NULL);
  chThdCreateStatic(wa_physics, sizeof(wa_physics), HIGHPRIO, Physics, NULL);
  chThdCreateStatic(wa_telemetry, sizeof(wa_telemetry), LOWPRIO, Telemetry, NULL);
  while (true) chThdSleepMilliseconds(1000);
}
