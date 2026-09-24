# R.A.C.E. - Analog steering and shift diagnostics

**Historical revision:** [RACING_V5.md](RACING_V5.md) removes manual gears.
Use the v5 wiring and deployment instructions for the current firmware.

## Deployment

Flash **ECU1_Cockpit and ECU2_Powertrain** and refresh the locally served game.
The v3 binary packet layouts are unchanged: **ESP32 and Arduino do not need
reflashing for this revision**. Existing buzzer wiring and session reset remain.
Keep racing-materials.mjs and assets/environment/ alongside the other game files.

The existing user's ECU2 ST-LINK launch configuration is not changed.

## Downshift investigation and correction

The user reports that downshift also fails at standstill. Over-rev protection
does not explain that observation: the existing logic permits a downshift at
zero speed. A physical PC3 signal failure has not been confirmed or excluded.

Changes:

- Each of the four switches now has an independent four-sample debounce state.
  A noisy throttle/brake input cannot continually restart shift debouncing.
- Holding a switch still shifts once, and a simultaneous up/down chord remains
  reserved for recentering. Releasing the chord does not invent another press.
- If several downshifts are queued at speed, ECU2 now applies every safe
  intermediate gear instead of waiting until the final requested gear is safe.
- Over-rev protection is retained: 2nd -> 1st waits above 75 km/h; 3rd -> 2nd
  waits above 125 km/h. Brake to complete unsafe downshifts.
- Periodic ECU2 threads use ChibiOS windowed deadline sleep, which avoids
  sleeping until timer wrap if a deadline has already passed.

### Bench test at standstill

1. Start with both shift buttons released. Enter second or third gear.
2. Release the upshift button completely, then press downshift alone.
3. Read ECU1 USB serial at 115200 baud. It prints:
   steer, pedal, gear, raw, center, X, Y, buttons=raw/stable, up, down.
4. With only downshift pressed, buttons should settle at **8/8** (hex).
   The down counter increments once per press and gear decrements.
   With no switches pressed, buttons should settle at **0/0**.
5. If buttons stays 0/0, or down never increments, check the normally-open
   switch between **ECU1 PC3 and GND**. Check the GPIO name, not an Arduino
   connector number. Remove power before changing connections.
6. If buttons reads C/C, both shift inputs are low: investigate the upshift
   switch or a shared/incorrect contact. The calibration chord suppresses shifts.
7. ECU2 debug now includes Gear (accepted), Req (requested), and Shift.
   At standstill Req=2 and Gear=2 must agree. Shift:BRAKE at speed explicitly
   reports a deferred unsafe downshift. If Req never changes but ECU1 gear does,
   inspect the inter-ECU connection and valid/invalid RX counters.

Passing host tests cannot certify the actual switch or wiring. Retain these
observations when reporting an unresolved hardware failure.

## Analog stick response

ECU1 now uses a +/-24 ADC-count noise deadzone instead of +/-110 counts.
Normalization is linear with rounding, exposing all **201 signed values** from
-100 to +100. The existing int8 protocol does not transmit all 4096 ADC codes.
Q8 filtering uses coefficient 1/2 rather than 1/4 to reduce lag.

The browser's default additional deadzone is zero and its response is linear,
not cubic. A rate-limited exponential interpolation softens sudden full throws
without suppressing small commands. The ECU2 -> ESP32 stream runs at 50 Hz;
Arduino and debug remain at 10 Hz. ECU1 sampling/transmission already runs at
50 Hz. Actual rates and timing still require a hardware measurement.

### One-time direction and range calibration

1. At power-up release the joystick for approximately 1.5 seconds.
2. In Controls / diagnostics, click **Calibrate LEFT / CENTER / RIGHT**.
3. Leave the stick centered for one second; click **Capture CENTER**.
4. Move horizontally fully left, hold for one second; click **Capture LEFT**.
5. Move horizontally fully right, hold for one second; click **Capture RIGHT**.
6. Move a little left/right. Input and output should show intermediate values,
   and the horizontal meter should move continuously in the expected direction.

The wizard learns polarity and independent left/right travel; reversed or
asymmetric hardware is supported. It rejects insufficient or same-side travel
instead of interpreting the result as a valid calibration. The vehicle must be
stopped. Settings are stored under race-controls-v4, so stale v3 center,
deadzone and direction settings are deliberately not reused.

If Input already jumps between 0 and +/-100 before browser shaping, inspect
the ADC-side signal rather than increasing browser smoothing:

- VRX must connect to PA0, not the joystick's digital SW output.
- Joystick supply is 3V3; grounds must be common.
- Move only horizontally and inspect ECU1 X/Y raw values (0..4095).
  X must change gradually. Y can float if its optional PA1 wire is absent.
- If only Y changes horizontally, the module is mounted with exchanged axes:
  rotate it or route the appropriate analog axis to PA0. Do not mix X and Y
  by summing them: diagonals must not determine steering sign.
- JOYSTICK_STEERING_CHANNEL defaults to 0 in ECU1. It can be changed to 1 only
  if the desired analog axis is intentionally wired to PA1.

The wrong axis, a loose ground, an open ADC wire or a defective potentiometer
cannot be repaired by calibration software.

## Landscape

The geometric cone trees and cone mountains are removed. The scene uses:

- Local scanned grass, rocky ground and asphalt, with normal/roughness maps.
- A local photographic HDR sky for the background and car/environment reflections.
- Continuous rolling terrain with mixed texture scales to reduce visible tiling.
- Alpha-tested branched tree cards, smooth rocks and the existing circuit furniture.

All new downloaded assets are CC0; provenance is in assets/environment/README.md.
Tree cards are a performance compromise, not fully modeled botanical meshes.
The new environment assets do not require Internet during driving; Three.js,
Draco and the Ferrari still use the existing CDN.

## Verification

- Compile both STM32 targets.
- Compile tests/firmware-controls.c using a host C99 compiler and run it.
  This tests the same header functions used by the firmware: 201 input levels,
  independent debounce, one shift per press, standstill shifts, queued shifts
  and over-rev protection.
- Run node --test tests/racing-core.test.mjs.
- Run node tests/browser-smoke.cjs with Playwright configured. It covers the
  reversed-axis calibration wizard, a 5% micro-steering command, session reset,
  buzzer heartbeat, audio, local HDR loading and responsive layout.
- Perform the standstill button test and horizontal analog sweep above after
  flashing. Firmware compilation and browser mocks do not replace board tests.
