# R.A.C.E. - Continuous drivetrain without gear controls

This revision removes manual shifting from ECU1, ECU2, the game and the Arduino
cluster. Flash **ECU1_Cockpit**, **ECU2_Powertrain** and the
**Arduino_DigitalCluster** sketch, then refresh the browser page. The ESP32
gateway does not need reflashing because packet lengths and field offsets are
unchanged.

## Controls and dynamics

- ECU1 PC0 is throttle and PC1 is brake. PC2 and PC3 are not read. Disconnect
  their old buttons if desired, with the boards powered off.
- ECU1 transmits a fixed value of 1 in the old gear byte. ECU2 checks that
  byte but does not use it for shifting. The gateway still forwards the fixed
  byte to preserve the v3 telemetry layout. The game does not display it.
- ECU2 computes one continuous acceleration curve. Drive falls from 38 to
  11 km/h/s as speed rises from 0 to 360 km/h. Drag and braking remain active.
  RPM rises smoothly from 1000 toward 8000 with engine inertia.
- Keyboard demo: W/S for throttle/brake, A/D for steering, R for recovery.
  E/Q have no effect. The browser HUD and Arduino LCD no longer show a gear.
  The Arduino RPM LEDs and the off-track buzzer keep working.
- Session reset, communication timeouts and the return UART alarm path are
  unchanged.
- Steering wheel angle and high-speed yaw response are reduced to make sudden
  full-stick commands less abrupt. Previous browser calibration values are
  not reused; the new settings key is race-controls-v5.

The fixed byte is a protocol compatibility field, not an available gear. The
eight-byte cockpit packet and fourteen-byte telemetry packet remain packed
and retain their XOR checksums.

## Why steering can still jump

The observed ECU1 serial values show that **X** jumps between its extremes
during a slow horizontal sweep, while **Y changes gradually**. On this
joystick mount the firmware therefore uses ADC channel 1: PA1 / Y for
steering. No joystick rewiring is needed if Y is already connected to PA1.
Downstream smoothing and calibration cannot recover intermediate positions
from the jumping X signal.

With power off, check joystick VRY -> ECU1 PA1, joystick VCC -> ECU1 3V3
and joystick GND -> ECU1 GND. Verify that PA1 is connected to the analog VRY
pin rather than the module's digital SW contact. On the powered board, use the
ECU1 USB serial output at 115200 baud:

1. Note X and Y with the stick centered, then move slowly left to right.
   The debug line reports axis=Y/PA1; raw should match Y.
2. Y should cross a stable center and intermediate values in both directions.
   The firmware selects JOYSTICK_STEERING_CHANNEL=1 for the observed wiring.
3. If Y stops changing smoothly, inspect supply, common ground and the
   joystick potentiometer. A loose analog wire may float toward the rails.
4. Once the raw value changes gradually, repeat the game's three-point
   LEFT / CENTER / RIGHT calibration while stopped.

Do not connect 5 V to an STM32 analog input. The cause of X jumping is still
unknown, but the observed smooth Y signal can be used for steering.

## Verification

Build both STM32 targets and the Arduino sketch. Run the host C test and
`node --test tests/racing-core.test.mjs`. The browser smoke test confirms
the absence of gear controls and checks session reset, audio, buzzer feedback
and calibration with simulated telemetry. Finally, on hardware verify:

- PC2/PC3 presses do not change speed, RPM or game UI.
- Holding PC0 increases speed smoothly; PC1 brakes.
- LCD shows speed and RPM, with no gear text.
- The off-track buzzer still sounds and stops with the track alarm.
- ECU1 Y and the selected raw value change through intermediate ADC values
  when the stick moves slowly.
