# R.A.C.E. Software Architecture

## Design principles

The repository separates hardware initialization, protocol definitions,
shared state, periodic services, rendering, and user-interface concerns.
Entry-point files contain only framework bootstrap code. No packet layout,
control algorithm, or rendering component is implemented in an entry point.

## Repository layout

```text
R.A.C.E/
├── ECU1_Cockpit/
│   ├── cfg/                 ChibiOS configuration
│   ├── include/             Public module interfaces and configuration
│   ├── source/              ADC, controls, state, UART and diagnostics
│   └── main.c               HAL/RT bootstrap only
├── ECU2_Powertrain/
│   ├── cfg/                 ChibiOS configuration
│   ├── include/             Public module interfaces and protocol types
│   ├── source/              RX services, state, physics and telemetry
│   └── main.c               HAL/RT bootstrap only
├── Arduino_DigitalCluster/
│   └── DigitalCluster/      Display, parser and protocol modules
├── ESP32CAM_TelemetryGateway/
│   ├── src/                 Gateway application and embedded web page
│   └── *.ino/main.cpp       Arduino IDE and PlatformIO entry points
├── game/
│   ├── js/audio/            Web Audio engine
│   ├── js/core/             Deterministic simulation helpers
│   ├── js/render/           Cockpit, materials and scenery
│   ├── js/racing-game.mjs   Runtime orchestration
│   └── styles/              Game presentation
├── assets/                  Local runtime textures and HDR environment
├── tests/                   Host and browser regression tests
└── docs/                    Requirements and design documentation
```

## ECU1 modules

| Module | Responsibility |
|---|---|
| `cockpit_app` | UART pin configuration, serial driver startup and service composition. |
| `joystick` | ADC1/DMA configuration, startup calibration, filtering and steering publication. |
| `buttons` | Active-low GPIO sampling and independent debounce. |
| `controls` | Pure joystick mapping and debounce algorithms; host-testable without ChibiOS. |
| `cockpit_state` | Locked shared-state ownership and consistent snapshots. |
| `cockpit_protocol` | Packed v2 frame definition and XOR checksum. |
| `cockpit_link` | Periodic bounded-time UART transmission. |
| `cockpit_diagnostics` | Low-priority USB serial diagnostics. |

## ECU2 modules

| Module | Responsibility |
|---|---|
| `powertrain_app` | Board pin configuration, serial startup and service composition. |
| `race_protocol` | Packed cockpit, telemetry and feedback frames plus validation. |
| `powertrain_state` | Single owner of shared concurrent state and freshness calculations. |
| `cockpit_receiver` | Sliding-window ECU1 parser and validated command publication. |
| `feedback_receiver` | Sliding-window game-feedback parser. |
| `vehicle_dynamics` | Independent 100 Hz speed/RPM model and reset safety state. |
| `telemetry_service` | 50 Hz gateway frames, 10 Hz cluster frames and debug text. |

All RTOS working areas remain static. State mutations and snapshots are
protected inside the state modules, preventing callers from sharing mutable
globals directly.

## Peripheral applications

The Arduino cluster separates packet validation, UART reception and display
outputs. The ESP32 gateway uses the same `GatewayApp` implementation from
both its Arduino IDE sketch and its PlatformIO entry point; the embedded
telemetry page is isolated in `WebPage.h`.

The browser game keeps deterministic logic in `core`, graphical components
in `render`, audio in `audio`, CSS in `styles`, and orchestration in
`racing-game.mjs`. `index.html` contains only document structure, the Three.js
import map and the application loader.

## Verification boundaries

- `tests/firmware-controls.c` tests the pure ECU1 control algorithms.
- `tests/racing-core.test.mjs` tests protocol decoding, steering, reset and lap timing.
- `tests/browser-smoke.cjs` verifies the assembled browser application with mocked telemetry.
- Each STM32 target is compiled independently with its ChibiOS Makefile.
- Arduino Uno is compiled with Arduino CLI.
- ESP32 is compiled with PlatformIO using `platformio.ini`.
