#include "ch.h"
#include "hal.h"
#include "chprintf.h"

#define JOYSTICK_ADC_DEPTH       1U
#define JOYSTICK_PERIOD_MS       20U
#define JOYSTICK_CENTER          2048
#define JOYSTICK_DEAD_ZONE       100
#define JOYSTICK_MAX             100
#define COCKPIT_PACKET_HEADER    0xAAAAU
#define COCKPIT_PACKET_MSG_ID    0x010AU

/*
 * The DMA writes one sample for each channel in the sequence:
 * joystick_buffer[0] = PA0 / ADC1_IN1 / steering
 * joystick_buffer[1] = PA1 / ADC1_IN2 / accelerator-brake
 */
static adcsample_t joystick_buffer[2];

volatile int32_t steer_val;
volatile int32_t pedal_val;

static volatile bool joystick_sample_ready;
static volatile adcerror_t joystick_adc_last_error;

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint16_t msg_id;
  int8_t steer_val;
  int8_t pedal_val;
  uint8_t crc;
} CockpitPacket_t;

static const SerialConfig serial_config = {
  115200U,
  0U,
  USART_CR2_STOP1_BITS,
  0U
};

static const ADCConfig joystick_adc_config = {
  .difsel = 0U
};

static void joystick_adc_end(ADCDriver *adcp) {
  (void)adcp;

  joystick_sample_ready = true;
}

static void joystick_adc_error(ADCDriver *adcp, adcerror_t err) {
  (void)adcp;

  joystick_adc_last_error = err;
}

static const ADCConversionGroup joystick_adc_group = {
  .circular     = false,
  .num_channels = 2U,
  .end_cb       = joystick_adc_end,
  .error_cb     = joystick_adc_error,
  .cfgr         = 0U,
  .cfgr2        = 0U,
  .tr1          = ADC_TR_DISABLED,
  .tr2          = ADC_TR_DISABLED,
  .tr3          = ADC_TR_DISABLED,
  .awd2cr       = 0U,
  .awd3cr       = 0U,
  .smpr         = {
    ADC_SMPR1_SMP_AN1(ADC_SMPR_SMP_247P5) |
    ADC_SMPR1_SMP_AN2(ADC_SMPR_SMP_247P5),
    0U
  },
  .sqr          = {
    ADC_SQR1_SQ1_N(ADC_CHANNEL_IN1) |
    ADC_SQR1_SQ2_N(ADC_CHANNEL_IN2),
    0U,
    0U,
    0U
  }
};

static int32_t joystick_normalize(adcsample_t raw) {
  int32_t delta = (int32_t)raw - JOYSTICK_CENTER;
  int32_t magnitude;
  int32_t limit;

  if ((delta >= -JOYSTICK_DEAD_ZONE) &&
      (delta <= JOYSTICK_DEAD_ZONE)) {
    return 0;
  }

  if (delta > 0) {
    magnitude = delta - JOYSTICK_DEAD_ZONE;
    limit = 4095 - JOYSTICK_CENTER - JOYSTICK_DEAD_ZONE;
    magnitude = (magnitude * JOYSTICK_MAX) / limit;
    return (magnitude > JOYSTICK_MAX) ? JOYSTICK_MAX : magnitude;
  }

  magnitude = -delta - JOYSTICK_DEAD_ZONE;
  limit = JOYSTICK_CENTER - JOYSTICK_DEAD_ZONE;
  magnitude = (magnitude * JOYSTICK_MAX) / limit;
  return (magnitude > JOYSTICK_MAX) ? -JOYSTICK_MAX : -magnitude;
}

static uint8_t calculate_crc(const uint8_t *data, size_t length) {
  uint8_t crc = 0U;

  while (length > 0U) {
    crc ^= *data++;
    length--;
  }

  return crc;
}

static THD_WORKING_AREA(wa_joystick, 256);
static THD_FUNCTION(JoystickThread, arg) {
  (void)arg;

  palSetPadMode(GPIOA, 0U, PAL_MODE_INPUT_ANALOG);
  palSetPadMode(GPIOA, 1U, PAL_MODE_INPUT_ANALOG);

  adcStart(&ADCD1, &joystick_adc_config);
  adcStartConversion(&ADCD1, &joystick_adc_group, joystick_buffer,
                     JOYSTICK_ADC_DEPTH);

  while (true) {
    chThdSleepMilliseconds(JOYSTICK_PERIOD_MS);

    if (joystick_sample_ready) {
      joystick_sample_ready = false;
      chSysLock();
      steer_val = joystick_normalize(joystick_buffer[0]);
      pedal_val = joystick_normalize(joystick_buffer[1]);
      chSysUnlock();
    }

    /*
     * A two-channel DMA conversion completes much sooner than 20 ms. Avoid
     * adcConvert() so this thread never waits for the ADC synchronously.
     */
    if (ADCD1.state == ADC_READY) {
      adcStartConversion(&ADCD1, &joystick_adc_group, joystick_buffer,
                         JOYSTICK_ADC_DEPTH);
    }
  }
}

static THD_WORKING_AREA(wa_cockpit_tx, 256);
static THD_FUNCTION(CockpitTxThread, arg) {
  CockpitPacket_t packet;

  (void)arg;

  while (true) {
    int32_t steer;
    int32_t pedal;

    chSysLock();
    steer = steer_val;
    pedal = pedal_val;
    chSysUnlock();

    packet.header = COCKPIT_PACKET_HEADER;
    packet.msg_id = COCKPIT_PACKET_MSG_ID;
    packet.steer_val = (int8_t)steer;
    packet.pedal_val = (int8_t)pedal;
    packet.crc = calculate_crc((const uint8_t *)&packet,
                               sizeof(CockpitPacket_t) - sizeof(packet.crc));

    /*
     * The timeout keeps the transmitter thread from waiting indefinitely if
     * the serial driver is temporarily unable to accept data.
     */
    (void)chnWriteTimeout(&SD1, (const uint8_t *)&packet, sizeof(packet),
                          TIME_MS2I(2));
    chThdSleepMilliseconds(JOYSTICK_PERIOD_MS);
  }
}

int main(void) {
  halInit();
  chSysInit();

  /*
   * Inter-ECU UART: USART1, PC4 = TX and PC5 = RX.
   * ST-LINK virtual COM port: USART2, PA2 = TX and PA3 = RX.
   */
  palSetPadMode(GPIOC, 4U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOC, 5U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOA, 2U, PAL_MODE_ALTERNATE(7));
  palSetPadMode(GPIOA, 3U, PAL_MODE_ALTERNATE(7));
  sdStart(&SD1, &serial_config);
  sdStart(&SD2, &serial_config);

  chThdCreateStatic(wa_joystick, sizeof(wa_joystick), NORMALPRIO,
                    JoystickThread, NULL);
  chThdCreateStatic(wa_cockpit_tx, sizeof(wa_cockpit_tx), NORMALPRIO,
                    CockpitTxThread, NULL);

  while (true) {
    int32_t steer;
    int32_t pedal;

    chSysLock();
    steer = steer_val;
    pedal = pedal_val;
    chSysUnlock();

    chprintf((BaseSequentialStream *)&SD2, "steer=%ld pedal=%ld\r\n",
             (long)steer, (long)pedal);
    chThdSleepMilliseconds(100);
  }
}
