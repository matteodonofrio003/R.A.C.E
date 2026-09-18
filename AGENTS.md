# ChibiOS Workspace

## Paths

- **Recommended workspace:** `C:/ChibiStudio/workspace_user`
- **ChibiOS tree:** `../chibios2111` (external ChibiOS 21.11.x stable tree)
- **Project documentation:** `docs/`
  - `DS/` — STM32G474 MCU datasheet
  - `RM/` — STM32G4 reference manual
  - `ES/` — STM32G474 errata sheet
  - `board/` — NUCLEO-G474RE board schematic

## ChibiOS Tree

| Directory | Contents |
|---|---|
| `os/rt` | RT real-time kernel |
| `os/nil` | Minimal NIL kernel |
| `os/hal` | Hardware abstraction layer and drivers |
| `os/common` | Startup code, ports, and linker scripts |
| `os/oslib` | OS libraries such as mailboxes and memory pools |
| `os/ex` | Complex device drivers |
| `os/sb` | Sandbox support |
| `os/various` | Shell, FatFS bindings, and utilities |
| `os/test` | Test framework |
| `demos/` | Platform demonstrations |
| `testhal/` | HAL driver tests |
| `testrt/` | RT kernel tests |
| `testex/` | Extended driver tests |
| `ext/` | External libraries |
| `community/` | Community contributions |
| `tools/` | Build scripts and utilities |

## Project Organization

Each firmware target contains:

- `cfg/` — ChibiOS configuration (`chconf.h`, `halconf.h`, `mcuconf.h`)
- `source/` — application and driver sources
- `main.c` — HAL/RTOS entry point
- `Makefile` — complete target build
- `.project` and `.cproject` — Eclipse/ChibiStudio metadata

The repository root `Makefile` dispatches builds to all three targets.

## Build

- Default ChibiOS path from a target: `../../chibios2111`
- Toolchain: `arm-none-eabi-gcc` supplied by ChibiStudio
- Build all targets: `make` from the repository root
- Build one target: `make -C smart-ppe-helmet` (or another target directory)
- Override the ChibiOS tree when needed: `make CHIBIOS=/path/to/chibios2111`

## Coding Style

- K&R braces, two-space indentation, no tabs in source files
- LF line endings
- `/* */` for block comments and `//` for short inline comments
- Application-owned documentation, comments, UI text, and log messages are in English
- Do not modify wording or licensing in vendored `ugfx/` or Edge Impulse sources

