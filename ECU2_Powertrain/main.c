#include "ch.h"
#include "hal.h"
#include "chprintf.h"

#define COCKPIT_PACKET_HEADER    0xAAAAU
#define COCKPIT_PACKET_MSG_ID    0x010AU

#define ENGINE_RPM_IDLE          1000U
#define ENGINE_RPM_MAX           8000U
#define RPM_ACCEL_STEP           50
#define RPM_COAST_DECAY          20
#define RPM_BRAKE_DECAY          80
#define SPEED_PER_RPM_KMH        0.025f

#define CLAMP(value, lower, upper) \
  (((value) < (lower)) ? (lower) : (((value) > (upper)) ? (upper) : (value)))

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint16_t msg_id;
  int8_t steer_val;
  int8_t pedal_val;
  uint8_t crc;
} CockpitPacket_t;

volatile int8_t target_steer;
volatile int8_t target_pedal;
volatile uint16_t engine_rpm = ENGINE_RPM_IDLE;
volatile float vehicle_speed_kmh = ENGINE_RPM_IDLE * SPEED_PER_RPM_KMH;
volatile uint32_t cockpit_rx_valid_packets;
volatile uint32_t cockpit_rx_invalid_packets;

static const SerialConfig ecu_serial_config = {
  115200U,
  0U,
  USART_CR2_STOP1_BITS,
  0U
};

static uint8_t calculate_crc(const uint8_t *data, size_t length) {
  uint8_t crc = 0U;

  while (length > 0U) {
    crc ^= *data++;
    length--;
  }

  return crc;
}

static bool cockpit_packet_is_valid(const CockpitPacket_t *packet) {
  uint8_t crc;

  if ((packet->header != COCKPIT_PACKET_HEADER) ||
      (packet->msg_id != COCKPIT_PACKET_MSG_ID)) {
    return false;
  }

  crc = calculate_crc((const uint8_t *)packet,
                      sizeof(CockpitPacket_t) - sizeof(packet->crc));
  return crc == packet->crc;
}

static THD_WORKING_AREA(wa_uart_receiver, 256);
static THD_FUNCTION(UartReceiverThread, arg) {
  CockpitPacket_t packet;
  uint8_t byte;
  size_t index = 0U;

  (void)arg;

  while (true) {
    if (chnReadTimeout(&SD1, &byte, 1U, TIME_INFINITE) != 1U) {
      continue;
    }

    /*
     * A byte-oriented state machine makes the stream self-synchronizing.
     * This is essential when one ECU resets while the other is transmitting:
     * the first received byte can otherwise be in the middle of a packet.
     */
    if (index == 0U) {
      if (byte == 0xAAU) {
        ((uint8_t *)&packet)[index++] = byte;
      }
      continue;
    }

    if (index == 1U) {
      if (byte == 0xAAU) {
        ((uint8_t *)&packet)[index++] = byte;
      }
      else {
        index = 0U;
      }
      continue;
    }

    ((uint8_t *)&packet)[index++] = byte;
    if (index == sizeof(packet)) {
      if (cockpit_packet_is_valid(&packet)) {
        /*
         * Both 8-bit targets are updated in one short critical section, so
         * the dynamics thread always takes a consistent command pair.
         */
        chSysLock();
        target_steer = packet.steer_val;
        target_pedal = packet.pedal_val;
        cockpit_rx_valid_packets++;
        chSysUnlock();
      }
      else {
        chSysLock();
        cockpit_rx_invalid_packets++;
        chSysUnlock();
      }

      index = 0U;
    }
  }
}

static THD_WORKING_AREA(wa_vehicle_dynamics, 256);
static THD_FUNCTION(VehicleDynamicsThread, arg) {
  (void)arg;

  while (true) {
    int8_t pedal;
    int8_t steer;
    int32_t next_rpm;
    uint16_t rpm;
    float speed;

    /*
     * This section does not block. It protects the two command bytes from
     * being observed between the receiver thread's two assignments.
     */
    chSysLock();
    steer = target_steer;
    pedal = target_pedal;
    chSysUnlock();
    (void)steer;

    chSysLock();
    rpm = engine_rpm;
    chSysUnlock();
    next_rpm = (int32_t)rpm;

    if (pedal > 0) {
      next_rpm += ((int32_t)pedal * RPM_ACCEL_STEP) / 100;
    }
    else if (pedal == 0) {
      next_rpm -= RPM_COAST_DECAY;
    }
    else {
      next_rpm -= RPM_COAST_DECAY +
                  ((-(int32_t)pedal * RPM_BRAKE_DECAY) / 100);
    }

    next_rpm = CLAMP(next_rpm, (int32_t)ENGINE_RPM_IDLE,
                     (int32_t)ENGINE_RPM_MAX);
    rpm = (uint16_t)next_rpm;
    speed = (float)rpm * SPEED_PER_RPM_KMH;

    chSysLock();
    engine_rpm = rpm;
    vehicle_speed_kmh = speed;
    chSysUnlock();

    chThdSleepMilliseconds(10);
  }
}

static THD_WORKING_AREA(wa_telemetry, 256);
static THD_FUNCTION(TelemetryThread, arg) {
  (void)arg;

  while (true) {
    int8_t pedal;
    uint16_t rpm;
    float speed;
    uint32_t valid_packets;
    uint32_t invalid_packets;

    chSysLock();
    pedal = target_pedal;
    rpm = engine_rpm;
    speed = vehicle_speed_kmh;
    valid_packets = cockpit_rx_valid_packets;
    invalid_packets = cockpit_rx_invalid_packets;
    chSysUnlock();

    chprintf((BaseSequentialStream *)&SD2,
             "Pedal: %d%% | RPM: %d | Speed: %.1f km/h | RX: %lu/%lu\r\n",
             (int)pedal, (int)rpm, (double)speed,
             (unsigned long)valid_packets, (unsigned long)invalid_packets);
    chThdSleepMilliseconds(100);
  }
}

int main(void) {
  halInit();
  chSysInit();

  /*
   * Inter-ECU UART: USART1, PC4 = TX and PC5 = RX.
   * Debug UART: ST-LINK VCP via USART2, PA2 = TX and PA3 = RX.
   */
  palSetPadMode(GPIOC, 4U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOC, 5U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOA, 2U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOA, 3U, PAL_MODE_ALTERNATE(7));

  sdStart(&SD1, &ecu_serial_config);
  sdStart(&SD2, &ecu_serial_config);

  chThdCreateStatic(wa_uart_receiver, sizeof(wa_uart_receiver), NORMALPRIO,
                    UartReceiverThread, NULL);
  chThdCreateStatic(wa_vehicle_dynamics, sizeof(wa_vehicle_dynamics),
                    HIGHPRIO, VehicleDynamicsThread, NULL);
  chThdCreateStatic(wa_telemetry, sizeof(wa_telemetry), LOWPRIO,
                    TelemetryThread, NULL);

  while (true) {
    chThdSleepMilliseconds(TIME_INFINITE);
  }
}
