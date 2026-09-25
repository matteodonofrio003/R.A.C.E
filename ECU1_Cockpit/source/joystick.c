#include "ch.h"
#include "hal.h"
#include "cockpit_config.h"
#include "cockpit_state.h"
#include "controls.h"
#include "joystick.h"

static adcsample_t joystick_buffer[2];
static volatile bool sample_ready;
static volatile adcerror_t last_error;

static const ADCConfig adc_config = {.difsel = 0U};

static void adcEnd(ADCDriver *adcp) {
  (void)adcp;
  sample_ready = true;
}

static void adcError(ADCDriver *adcp, adcerror_t error) {
  (void)adcp;
  last_error = error;
}

static const ADCConversionGroup adc_group = {
  .circular = false,
  .num_channels = 2U,
  .end_cb = adcEnd,
  .error_cb = adcError,
  .cfgr = 0U,
  .cfgr2 = 0U,
  .tr1 = ADC_TR_DISABLED,
  .tr2 = ADC_TR_DISABLED,
  .tr3 = ADC_TR_DISABLED,
  .awd2cr = 0U,
  .awd3cr = 0U,
  .smpr = {
    ADC_SMPR1_SMP_AN1(ADC_SMPR_SMP_247P5) |
    ADC_SMPR1_SMP_AN2(ADC_SMPR_SMP_247P5), 0U
  },
  .sqr = {
    ADC_SQR1_SQ1_N(ADC_CHANNEL_IN1) |
    ADC_SQR1_SQ2_N(ADC_CHANNEL_IN2), 0U, 0U, 0U
  }
};

static THD_WORKING_AREA(wa_joystick, 256);
static THD_FUNCTION(JoystickThread, arg) {
  uint32_t sum = 0U;
  uint16_t samples = 0U, minimum = 4095U, maximum = 0U;
  int32_t center = JOYSTICK_DEFAULT_CENTER;
  int32_t filtered = JOYSTICK_DEFAULT_CENTER * 256;
  bool calibrating = true;
  (void)arg;

  palSetPadMode(GPIOA, 0U, PAL_MODE_INPUT_ANALOG);
  palSetPadMode(GPIOA, 1U, PAL_MODE_INPUT_ANALOG);
  adcStart(&ADCD1, &adc_config);
  adcStartConversion(&ADCD1, &adc_group, joystick_buffer,
                     JOYSTICK_ADC_DEPTH);
  while (true) {
    chThdSleepMilliseconds(COCKPIT_PERIOD_MS);
    if (sample_ready) {
      uint16_t raw;
      int32_t steer;

      sample_ready = false;
      raw = joystick_buffer[JOYSTICK_STEERING_CHANNEL];
      if (calibrating) {
        sum += raw;
        samples++;
        if (raw < minimum) minimum = raw;
        if (raw > maximum) maximum = raw;
        if (samples == 64U) {
          uint16_t candidate = (uint16_t)(sum / samples);
          if (((uint16_t)(maximum - minimum) <= 100U) &&
              (candidate >= 1200U) && (candidate <= 2900U)) {
            center = candidate;
            filtered = center * 256;
            calibrating = false;
          }
          sum = 0U;
          samples = 0U;
          minimum = 4095U;
          maximum = 0U;
        }
      }
      filtered += ((int32_t)raw * 256 - filtered) / 2;
      steer = calibrating ? 0 : joystickMap((uint16_t)(filtered / 256), center);
      cockpitStateSetJoystick(steer, center, raw, joystick_buffer[0],
                              joystick_buffer[1]);
    }
    if (ADCD1.state == ADC_READY) {
      adcStartConversion(&ADCD1, &adc_group, joystick_buffer,
                         JOYSTICK_ADC_DEPTH);
    }
  }
}

void joystickStart(void) {
  (void)last_error;
  chThdCreateStatic(wa_joystick, sizeof(wa_joystick), NORMALPRIO,
                    JoystickThread, NULL);
}
