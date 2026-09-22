# R.A.C.E. ? Circuit and controls v2

**Historical revision:** see [RACING_V3.md](RACING_V3.md) for the current protocol,
session reset, calibration and testing procedure. The v2 firmware is incompatible
with the current telemetry/feedback packets.

This revision replaces the baseline pedal joystick, fixed RPM-to-speed mapping
and nine-byte telemetry. Flash **all four targets** together. Old and new
binary frames are deliberately distinguishable and are not wire-compatible.

## Wiring

Disconnect power before moving wires. Use the printed GPIO names, not the
Arduino connector numbers on the Nucleo.

| Source / component | Destination | Notes |
|---|---|---|
| Joystick VRX | ECU1 PA0 | Steering, 0?3.3 V |
| Joystick VCC / GND | ECU1 3V3 / GND | Never apply 5 V to the ADC |
| Joystick VRY | ECU1 PA1 (optional) | Sampled but ignored; pedals use buttons |
| Throttle pushbutton | ECU1 PC0 ? GND | Normally open, internal pull-up |
| Brake pushbutton | ECU1 PC1 ? GND | Normally open, internal pull-up |
| Gear-up pushbutton | ECU1 PC2 ? GND | Normally open, internal pull-up |
| Gear-down pushbutton | ECU1 PC3 ? GND | Normally open, internal pull-up |
| ECU1 PC4 / USART1 TX | ECU2 PC5 / USART1 RX | 115200 baud, 8N1 |
| ECU2 PB10 / USART3 TX | Arduino D10 | 38400 baud, 8N1 |
| ECU2 PC10 / UART4 TX | ESP32 GPIO13 | 38400 baud, 8N1 |
| **ESP32 GPIO14 / UART1 TX** | **ECU2 PC11 / UART4 RX** | **New return wire, 3.3 V logic** |
| All boards GND | Common GND | Required for each UART link |
| Arduino A4 / A5 | LCD SDA / SCL | Existing I2C LCD at 0x27 |
| Arduino D7 / GND | Piezo buzzer | Existing buzzer, off-track only |
| Arduino D6 / D8 / D9 | Green / yellow / red LED | Existing resistors and shift lights |

Each button connects its assigned input to GND when pressed; do not connect
it to a positive supply. A four-leg tactile switch has internally joined pairs:
use opposite switch contacts, verified with continuity if necessary.
Remove any previous VisionHelper button from GPIO13 and buzzer from GPIO14.
These GPIOs are exclusively the telemetry UART now; do not enable microSD.
USB can power each board separately; keep UART grounds common and do not join
their positive USB power rails.

## Behaviour

- X-axis maps to steering-wheel position with the existing center/deadzone.
  Releasing it centers the front wheels; the car keeps its current heading.
  It cannot translate sideways while stopped.
- Buttons are debounced over four 5 ms samples. Brake overrides throttle.
  A held shift button shifts once. Simultaneous gear-up/down presses are ignored.
- Gear is transmitted as an absolute value so repeated packets never repeat a shift.
  Six gear speed limits are 75 / 125 / 180 / 240 / 300 / 360 km/h.
  Downshifts that would over-rev are deferred until speed falls into range.
- ECU2 integrates speed at 100 Hz, with inertia, drag and braking. The vehicle
  starts at 0 km/h and 1000 RPM. Changing gear does not jump vehicle speed.
- No valid cockpit frame for 250 ms causes braking towards standstill.
  The game pauses hardware motion when cockpit status or gateway data is stale.
- LEDs still indicate RPM. RPM never triggers the buzzer.
- Only the game knows track position. Its off-track heartbeat travels
  browser ? ESP32 ? ECU2 ? Arduino D7. The alarm is disabled in keyboard demo.
  The browser emits false on exit from live control; ESP32, ECU2 and Arduino
  independently expire stale data (500 ms at each stage).
  Allow up to approximately 0.8 s for a lost browser heartbeat to reach silence.
  A second driving tab cannot override the first tab's active feedback lease;
  close the first tab before switching controller.

## Circuit and timing

The track is a closed, sampled spline with physical world coordinates. A bicycle
steering model updates heading; a speed-dependent steering limit and lateral
grip limit make high-speed corners require braking. Use R / Return to track
if you leave the road. Recovering invalidates the current lap.

The HUD shows current lap time, completed laps, last lap, best valid lap,
current gear and session average speed. Timing begins with the first movement.
Average speed is integrated travelled distance divided by active session time,
including time stopped during an active session. Hidden tabs and disconnected
hardware pause the simulation and invalidate the lap; they are not timed.
The simulation uses up to 250 ms of elapsed time per frame with 120 Hz substeps.
On extremely slow rendering, simulated time can therefore fall behind wall time.

Sixteen ordered forward checkpoints prevent finish-line oscillation or a shortcut
from counting a lap. Track-limit violations mark the lap invalid; completed
invalid laps still increment the counter, but cannot set a best time.
Keyboard / hardware mode changes and New session reset timing and position.
New session does not reset the physical ECU2 drivetrain; release throttle first.

## Build and test

1. Build and flash ECU1_Cockpit and ECU2_Powertrain from their own ChibiStudio
   projects, selecting the intended ST-LINK for each board.
2. Upload Arduino_DigitalCluster/DigitalCluster/DigitalCluster.ino to the Uno.
3. Open ESP32CAM_TelemetryGateway in PlatformIO and run Build then Upload.
   Keep the ESP32 onboard UART0 RX pin free for USB upload.
4. Connect the new buttons and the GPIO14 ? PC11 return wire.
5. Check ECU1 debug output at 115200: steering changes with X, pedal is
   100 / -100 / 0, gear changes once per press. ECU2 reports the accepted gear.
6. Open the repository in VS Code and serve index.html with Live Server.
   Keep index.html, racing-game.mjs and racing-core.mjs together.
7. Load the page with Internet access until the Ferrari appears, then join
   HIL_Telemetry (password 12345678) without reloading.
   Three.js, its Draco decoder and the external car model require Internet.
8. The page should show ECU LIVE. Test steering at low speed, then gear changes.
   In keyboard demo: W/S pedals, A/D steering, E/Q gears, R recovery.
9. Drive outside the white track limits: OFF TRACK appears and Arduino D7 sounds.
   Return to asphalt: the buzzer stops. Close the page while off-track:
   the buzzer must stop after the heartbeat expires.
10. Complete the checkpoint sequence and cross the finish forward to record a lap.
    Verify a clean lap updates best time; an off-track lap does not.

Automated logic tests: node --test tests/racing-core.test.mjs.
Build/browser checks do not replace the physical wiring and alarm tests above.

## Binary protocol v2

All multibyte values are little-endian; float is IEEE-754 binary32.
Every checksum remains the existing one-byte XOR of all preceding bytes.
It is an XOR checksum, not a polynomial CRC.

| Link | Fields in byte order | Size |
|---|---|---|
| ECU1 ? ECU2 | header u16=0xAAAA, ID u16=0x010B, steer i8, buttons u8, requested gear u8, XOR u8 | 8 |
| ECU2 ? ESP32 / Uno | header u16=0xBCBC, RPM u16, speed f32, steer i8, accepted gear u8, flags u8, XOR u8 | 12 |
| ESP32 ? ECU2 | header u16=0xCCCC, offtrack u8 (0/1), XOR u8 | 4 |

Buttons: bit 0 throttle, bit 1 brake. Telemetry flags: bit 0 off-track alarm,
bit 1 cockpit link fresh. Unused bits must be zero.
Cockpit frames are sent approximately every 20 ms; telemetry and feedback every
100 ms. Sliding-window receivers recover from inserted or lost bytes.

WebSocket telemetry:

```json
{"rpm":4500,"speed":180.0,"steer":-25,"gear":4,"cockpit":true}
```

Browser feedback (unfragmented text frame, heartbeat every 100 ms):

```json
{"offtrack":true}
```

The ESP32 feedback parser deliberately accepts only the exact compact
offtrack true/false messages produced by the game.

## Visual assets

Three.js r180 is pinned via jsDelivr. The Ferrari 458 Italia model is loaded
externally from the official Three.js r180 car example, credited there to
vicent091036. A procedural coupe is shown if the external asset cannot load.
The model is not copied into this repository.

- Example and attribution: https://threejs.org/examples/webgl_materials_car.html
- Model: https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/models/gltf/ferrari.glb
- Original author link, as provided by the example:
  https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6
