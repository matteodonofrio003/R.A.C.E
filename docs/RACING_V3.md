# R.A.C.E. - Steering, session control and racing experience v3

This revision supersedes the v2 telemetry/feedback protocol and session behaviour.
The cockpit packet and existing button wiring remain unchanged.
**Rebuild and flash ECU1, ECU2, ESP32 and Arduino together.** Build verification
does not upload firmware. Do not use v2 binaries with the v3 browser.

## Wiring and deployment

The previously missing wire is **ESP32 GPIO14 (UART1 TX) -> ECU2 PC11 (UART4 RX)**.
Connect it with power removed; retain a common GND. This is a 3.3 V logic link,
not an Arduino 5 V output. GPIO14 must not also drive a buzzer or microSD.

| Signal | Connection |
|---|---|
| Steering | Joystick VRX -> ECU1 PA0; joystick powered from 3V3 |
| Throttle / brake | ECU1 PC0 / PC1 -> separate normally-open buttons -> GND |
| Gear up / down | ECU1 PC2 / PC3 -> separate normally-open buttons -> GND |
| Cockpit commands | ECU1 PC4 TX -> ECU2 PC5 RX, 115200 baud |
| Cluster telemetry | ECU2 PB10 TX -> Arduino D10 RX, 38400 baud |
| Gateway telemetry | ECU2 PC10 TX -> ESP32 GPIO13 RX, 38400 baud |
| Gateway return commands | ESP32 GPIO14 TX -> ECU2 PC11 RX, 38400 baud |
| Buzzer | Existing passive piezo: Arduino D7 and GND |
| LCD | Arduino A4 SDA / A5 SCL, I2C address 0x27 |
| Grounds | All four boards share GND; do not join separate USB positive rails |

1. Build and flash the correct STM32 target to each board. Select its ST-LINK;
   do not inadvertently program ECU2 firmware onto both Nucleos.
2. Upload Arduino_DigitalCluster/DigitalCluster/DigitalCluster.ino to the Uno.
3. Build and upload ESP32CAM_TelemetryGateway with PlatformIO. Keep UART0 RX
   free for the USB bootloader; telemetry uses GPIO13/14, not UART0.
4. Power up with the joystick released. Wait approximately 1.5 seconds.
5. Serve the repository root index.html with VS Code Live Server. Keep
   racing-game.mjs, racing-core.mjs, racing-scenery.mjs and racing-audio.mjs
   alongside it. Refresh the page to load the updated modules.
6. Load the graphics with Internet access, then join HIL_Telemetry,
   password 12345678. Three.js, Draco and the car model still require the CDN;
   they are not served by the ESP32. The simple ESP32 telemetry page is
   http://192.168.4.1/ and the game's WebSocket is ws://192.168.4.1/ws.
7. Open only one controlling game tab. Release throttle and wait for ECU LIVE.
   An initial session reset is performed when entering hardware mode.
8. Open Controls / diagnostics. Confirm Return UART OK before testing alarms.
9. Click Enable audio and adjust volume. Browser audio requires a user gesture.

## Steering calibration

ECU1 averages 64 stationary ADC samples at 50 Hz. The sample spread must not
exceed 100 ADC counts and the center must be within 1200..2900. Steering remains
zero while calibration retries. Leave the stick mechanically centered, not
held off-center. Center detection cannot distinguish a stable small deliberate
deflection from the true mechanical center.

The firmware applies a +/-110-count deadzone, asymmetric normalization around
the measured center, and a Q8 low-pass filter (coefficient 1/4).
JOYSTICK_MIN_RAW / JOYSTICK_MAX_RAW default to 80 / 4015; adjust these constants
if measured joystick endpoints differ significantly.

To recalibrate without rebooting, hold both gear buttons for one second,
release them and keep the stick centered for another 1.5 seconds. Observe
ECU1 debug output at 115200 baud: raw, center and steer.

The browser adds a progressive steering curve (35% linear, 65% cubic), default
sensitivity 0.80 and an additional 3% deadzone. Controls / diagnostics provides
sensitivity, deadzone, direction reversal and a stationary Center joystick
trim. The trim requires at least ten recent stable samples, stopped hardware,
and an offset within +/-30%. Browser settings persist in localStorage for the
current origin; changing Live Server port changes the settings origin.

Centering wheels preserves the vehicle's current heading, like a steering wheel;
the joystick does not directly position the vehicle laterally.

## Acknowledged session reset

New session resets local position, timing and average speed immediately, then
requests the next 16-bit session ID from ECU2. Hardware motion remains disabled
until telemetry echoes that exact ID. Old frames, including old zero-speed
frames, cannot acknowledge a reset. The first valid packet after opening an
offline page provides the baseline ID. IDs wrap from 65535 to zero.

ECU2 applies each changed ID once in the 100 Hz physics thread: speed=0,
RPM=1000. It holds standstill for at least 250 ms and requires a fresh cockpit
sample with the throttle button released before accepting another acceleration.
Brake masking a held throttle does not bypass this release requirement.
The applied ID is published in the same critical section as speed/RPM.

A delayed acknowledgement may already reflect subsequent acceleration; its ID
still proves that the old drivetrain state was reset. Repeated heartbeats with
the same ID do not repeatedly reset physics. Gear selection is retained.

Without the GPIO14 -> PC11 return wire the page stays at RESET PENDING and zero
displayed speed; it must not silently resume the old session. The telemetry
panel identifies the missing return UART. Return to track [R] only recovers
position and invalidates the lap; use New session to reset the drivetrain.

## Buzzer diagnostics and fail-safe behaviour

Test Arduino buzzer (1 s) is enabled only for fresh hardware telemetry with
a confirmed return UART and no pending reset. At standstill it requests the
same alarm path as a real track-limit violation:

browser -> WebSocket -> ESP32 GPIO14 -> ECU2 PC11 -> ECU2 PB10 -> Arduino D10 -> D7.

ECU2 reports the accepted alarm bit back to the browser. ALARM ACK confirms
ECU2 accepted the request, not that the piezo physically produced sound.
Arduino displays OFF TRACK! and writes ALARM ON: D7 / ALARM OFF: D7 to its USB
serial monitor at 115200 baud. If those appear without sound, inspect the
existing passive piezo wiring/component. RPM alone never activates it.

The one-second test pulse is a deliberate exception to automatic off-track-only
operation. At standstill it should end automatically; if the car is actually
off track the legitimate track alarm remains active.

Keyboard demo, hidden pages and stale cockpit telemetry request no alarm.
The gateway grants a single game page a 500 ms command lease. It clears the
alarm when that lease expires; ECU2 expires return UART data after 500 ms,
and Arduino expires incoming telemetry after 500 ms. There are independent
per-hop timeouts, not a single 500 ms end-to-end bound.

## Visuals and audio

The circuit now includes rolling grass terrain, broadleaf vegetation, rocks,
a reflective lake, track barriers, a covered grandstand and spectators.
Repeated scenery uses instanced meshes. Barriers are visual scenery, not a new
collision-physics model. Ferrari attribution and CDN requirements remain as v2.

Audio is synthesized locally using Web Audio: layered RPM-dependent engine,
gear-shift transient, speed-dependent wind, tyre squeal and gravel noise.
It requires no downloaded music or sound recordings. Audio is opt-in, has a
volume control, and fades out on mute, stale hardware, reset or a hidden tab.
Audio and visual effects do not drive ECU physics or the hardware buzzer.

## Protocol v3

All multibyte integers are little-endian; speed is IEEE-754 binary32.
Packets are packed with no padding. The checksum is XOR over all preceding
bytes, not a polynomial CRC or authentication mechanism.

| Link | Byte offset | Field |
|---|---:|---|
| ECU2 -> ESP32 / Arduino (14 bytes) | 0 | header u16 = 0xBDBD |
| | 2 | rpm u16, 1000..8000 |
| | 4 | speed f32, 0..360 km/h |
| | 8 | steer i8, -100..100 |
| | 9 | accepted gear u8, 1..6 |
| | 10 | flags u8: bit0 alarm, bit1 cockpit fresh, bit2 return UART fresh |
| | 11 | applied session ID u16 |
| | 13 | XOR u8 |
| ESP32 -> ECU2 (6 bytes) | 0 | header u16 = 0xCDCD |
| | 2 | offtrack u8, 0 or 1 |
| | 3 | requested session ID u16 |
| | 5 | XOR u8 |

Unused flag bits must be zero. The unchanged 8-byte cockpit packet is
0xAAAA u16, 0x010B u16, steer i8, buttons u8, gear u8, XOR u8.

WebSocket telemetry at approximately 10 Hz:

```json
{"rpm":4500,"speed":180.0,"steer":-25,"gear":4,"cockpit":true,"session":1,"feedback":true,"alarm":false}
```

Browser heartbeat (single, unfragmented text frame every 100 ms):

```json
{"offtrack":false,"session":1}
```

The gateway deliberately accepts exactly this compact field order, with a
boolean alarm and a decimal unsigned 16-bit session ID. Legacy messages without
session are rejected. A gateway with no valid ECU telemetry does not guess a
session ID and does not send reset commands.

## Verification

- Pure logic: node --test tests/racing-core.test.mjs.
- Browser integration: node tests/browser-smoke.cjs with Playwright installed;
  optionally set RACE_BROWSER to a Chromium executable and NODE_PATH to the
  directory containing Playwright. Uses a local server and mocked WebSocket,
  not physical boards. Screenshots are saved to the OS temporary directory.
- Rebuild both STM32 targets, the PlatformIO target and the Arduino Uno sketch.
- Physical acceptance: center remains at zero; correct steering direction;
  New session at speed resets both ECU2 debug speed and game speed to zero;
  holding throttle cannot restart until release; test buzzer sounds; leaving
  and re-entering asphalt starts/stops it; closing the game expires the alarm.
- Disconnect GPIO14 -> PC11 with power removed, repower, and verify missing
  return UART diagnostics and blocked session reset. Reconnect and repeat.

Automated builds and mock browser tests cannot verify actual GPIO continuity,
piezo sound, ADC accuracy or real-board scheduling. Perform the bench checks
above after flashing.
