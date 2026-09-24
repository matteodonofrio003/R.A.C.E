#include "ch.h"
#include "hal.h"
#include "chprintf.h"
#include "source/controls.h"

#define JOYSTICK_ADC_DEPTH       1U
#define JOYSTICK_PERIOD_MS       20U
#define JOYSTICK_CENTER          2048
#define JOYSTICK_STEERING_CHANNEL 1U
#define COCKPIT_PACKET_HEADER    0xAAAAU
#define COCKPIT_PACKET_MSG_ID    0x010BU

/*
 * The DMA writes one sample for each channel in the sequence:
 * joystick_buffer[0] = PA0 / ADC1_IN1 / diagnostic X axis
 * joystick_buffer[1] = PA1 / ADC1_IN2 / steering on this joystick mount
 */
static adcsample_t joystick_buffer[2];

volatile int32_t steer_val;
volatile int32_t pedal_val;
static volatile uint8_t button_state;
static int32_t joystick_center = JOYSTICK_CENTER;
static volatile uint16_t steering_raw;
static volatile uint16_t joystick_raw_x, joystick_raw_y;
static volatile uint8_t buttons_raw, buttons_stable;

static volatile bool joystick_sample_ready;
static volatile adcerror_t joystick_adc_last_error;

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint16_t msg_id;
  int8_t steer_val;
  uint8_t buttons;
  uint8_t reserved;
  uint8_t crc;
} CockpitPacket_t;
_Static_assert(sizeof(CockpitPacket_t) == 8U, "Cockpit v2 frame size");

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
  return joystick_map(raw, joystick_center);
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
  uint32_t sum = 0U;
  uint16_t samples = 0U, minimum = 4095U, maximum = 0U;
  int32_t filtered = JOYSTICK_CENTER * 256;
  bool calibrating = true;
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
      uint16_t raw = joystick_buffer[JOYSTICK_STEERING_CHANNEL];
      if (calibrating) {
        sum += raw; samples++;
        if (raw < minimum) minimum = raw;
        if (raw > maximum) maximum = raw;
        if (samples == 64U) {
          uint16_t center = sum / samples;
          /* Reject movement and a stick held at an end stop. */
          if (((uint16_t)(maximum - minimum) <= 100U) && (center >= 1200U) && (center <= 2900U)) {
            joystick_center = center;
            filtered = center * 256;
            calibrating = false;
          }
          sum = 0U; samples = 0U; minimum = 4095U; maximum = 0U;
        }
      }
      /* Q8 filtering at 50 Hz: smooth ADC noise without a long steering lag. */
      filtered += ((int32_t)raw * 256 - filtered) / 2;
      chSysLock();
      steering_raw = raw;
      joystick_raw_x = joystick_buffer[0];
      joystick_raw_y = joystick_buffer[1];
      steer_val = calibrating ? 0 : joystick_normalize((adcsample_t)(filtered / 256));
      /* ADC channel Y is retained but pedals are now digital buttons. */
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

/* PC0 throttle and PC1 brake, active-low. PC2/PC3 are unused.
 * Four identical 5 ms samples debounce each transition independently.
 */
static THD_WORKING_AREA(wa_buttons, 256);
static THD_FUNCTION(ButtonsThread, arg) {
  ButtonDebouncer debounce = {0};
  (void)arg;
  for (unsigned i = 0U; i < 2U; i++) {
    palSetPadMode(GPIOC, i, PAL_MODE_INPUT_PULLUP);
  }
  while (true) {
    uint8_t raw = 0U;
    for (unsigned i = 0U; i < 2U; i++) {
      if (palReadPad(GPIOC, i) == PAL_LOW) raw |= (uint8_t)(1U << i);
    }
    (void)buttons_update(&debounce, raw);
    uint8_t stable = debounce.stable;
    chSysLock();
    buttons_raw = raw;
    buttons_stable = stable;
    button_state = stable & 3U;
    pedal_val = (stable & 2U) ? -100 : ((stable & 1U) ? 100 : 0);
    chSysUnlock();
    chThdSleepMilliseconds(5);
  }
}

static THD_WORKING_AREA(wa_cockpit_tx, 256);
static THD_FUNCTION(CockpitTxThread, arg) {
  CockpitPacket_t packet;

  (void)arg;

  while (true) {
    int32_t steer;
    uint8_t buttons;

    chSysLock();
    steer = steer_val;
    buttons = button_state;
    chSysUnlock();

    packet.header = COCKPIT_PACKET_HEADER;
    packet.msg_id = COCKPIT_PACKET_MSG_ID;
    packet.steer_val = (int8_t)steer;
    packet.buttons = buttons;
    packet.reserved = 1U;
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
  chThdCreateStatic(wa_buttons, sizeof(wa_buttons), NORMALPRIO,
                    ButtonsThread, NULL);
  chThdCreateStatic(wa_cockpit_tx, sizeof(wa_cockpit_tx), NORMALPRIO,
                    CockpitTxThread, NULL);

  while (true) {
    int32_t steer;
    int32_t pedal;

    chSysLock();
    steer = steer_val;
    pedal = pedal_val;
    chSysUnlock();

    chprintf((BaseSequentialStream *)&SD2,
             "steer=%ld pedal=%ld raw=%u center=%ld X=%u Y=%u axis=Y/PA1 buttons=%x/%x\r\n",
             (long)steer, (long)pedal,
             (unsigned)steering_raw, (long)joystick_center,
             (unsigned)joystick_raw_x, (unsigned)joystick_raw_y,
             (unsigned)buttons_raw, (unsigned)buttons_stable);
    chThdSleepMilliseconds(100);
  }
}
