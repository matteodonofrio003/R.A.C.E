# Software Requirements Specification

## Distributed Automotive HIL (Hardware-in-the-Loop) Simulator

**Document status:** Original baseline. [RACING_V3.md](RACING_V3.md) specifies the wire protocol and reset/alarm behaviour; [RACING_V5.md](RACING_V5.md) describes the current continuous drivetrain without manual gears. Earlier racing revisions are historical.

**Standard:** IEEE 830 Software Requirements Specification  
**Target platform:** Two STM32G474RE NUCLEO-G474RE boards running **ChibiOS/RT** with **HAL v7**

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the functional and non-functional requirements for the **Distributed Automotive HIL Simulator**. The system reproduces a simplified dual-ECU automotive architecture in which a cockpit controller acquires driver inputs and a powertrain controller calculates real-time vehicle behaviour.

This document is intended for firmware developers, system integrators, test engineers, and academic assessors. It establishes the implementation and verification baseline for the project.

### 1.2 Scope

The simulator comprises two independently powered embedded nodes connected by a direct, bidirectional UART connection:

- **ECU1 — Cockpit Module:** acquires two analogue joystick axes representing steering and pedal demand, processes their values, and transmits driver-command frames.
- **ECU2 — Powertrain Module:** receives and validates cockpit commands, executes a simplified engine and vehicle-dynamics model, and publishes host-visible debug telemetry.

The system emulates the periodic and deterministic behaviour of an in-vehicle network, using a custom binary UART protocol in place of a CAN bus. It is intended for bench-level Hardware-in-the-Loop experimentation; it is not intended for deployment in a production vehicle or for controlling physical propulsion hardware.

### 1.3 Definitions, Acronyms, and Abbreviations

| Term | Definition |
|---|---|
| **ADC** | Analogue-to-Digital Converter. |
| **CRC** | Cyclic redundancy check; in this project, an 8-bit XOR checksum used for frame-integrity detection. |
| **DMA** | Direct Memory Access. |
| **ECU** | Electronic Control Unit. |
| **HIL** | Hardware-in-the-Loop. |
| **RPM** | Revolutions per minute. |
| **RTOS** | Real-Time Operating System. |
| **UART** | Universal Asynchronous Receiver/Transmitter. |
| **VCP** | Virtual COM Port exposed by the ST-LINK USB interface. |

### 1.4 References

| Identifier | Reference |
|---|---|
| REF-1 | IEEE 830, *Recommended Practice for Software Requirements Specifications*. |
| REF-2 | STMicroelectronics STM32G474xB/C/E datasheet. |
| REF-3 | STMicroelectronics STM32G4 reference manual. |
| REF-4 | ChibiOS/RT 21.11.x documentation and ChibiOS HAL v7 source tree. |
| REF-5 | NUCLEO-G474RE board documentation and schematic. |

### 1.5 Document Overview

Section 2 describes the system context, operating environment, constraints, and assumptions. Section 3 specifies external interfaces, functional requirements, timing requirements, quality attributes, and acceptance criteria.

---

## 2. Overall Description

### 2.1 Product Perspective

The product is a distributed embedded application composed of two firmware images. Each image executes on a separate **STM32G474RE** microcontroller and uses the **ChibiOS/RT** scheduler and **HAL v7** device drivers.

```text
2-axis joystick
      │ analogue signals
      ▼
ECU1 Cockpit ── UART binary command frames ──► ECU2 Powertrain ── UART/VCP ──► Host PC
    STM32G474RE       115200 bit/s, CRC          STM32G474RE       115200 bit/s
      ▲                    bidirectional              │
      └──────────────────── TX/RX crossed ────────────┘
```

The UART transport is a deterministic bench-level emulation of a vehicle network. UART framing, packet identification, and checksum validation are application responsibilities.

### 2.2 Product Functions

The system shall provide the following top-level functions:

1. Acquire steering and pedal demand from a two-axis analogue joystick.
2. Convert and normalize analogue inputs into signed command values.
3. Send cockpit commands from ECU1 to ECU2 at a fixed periodic rate.
4. Validate incoming command frames before they affect the powertrain model.
5. Simulate engine speed and vehicle speed with bounded inertia and pedal-dependent deceleration.
6. Send low-rate human-readable telemetry to a host PC.
7. Enter a safe simulated idle/coasting condition when communications are unavailable or invalid.

### 2.3 User Characteristics

The primary users are embedded-systems students, firmware developers, and laboratory engineers. Users are expected to understand STM32 development, serial connections, firmware flashing, and serial-terminal operation.

### 2.4 Operating Environment

| Item | Requirement |
|---|---|
| Processing nodes | Two NUCLEO-G474RE boards, each containing an STM32G474RE MCU. |
| Operating system | **ChibiOS/RT** real-time kernel. |
| Hardware abstraction | **ChibiOS HAL v7**. |
| Cockpit input | Two-axis analogue joystick, powered at MCU-compatible voltage levels. |
| Inter-ECU transport | Direct 3.3 V TTL UART connection with crossed TX/RX and common ground. |
| Host interface | ST-LINK USB Virtual COM Port connected to ECU2 debug UART. |
| Host software | Any serial-terminal or visualization application supporting 115200 bit/s, 8 data bits, no parity, 1 stop bit. |

### 2.5 Design and Implementation Constraints

- The firmware shall be written in **C** and shall target the STM32G474RE.
- The firmware shall use statically allocated RTOS working areas via `THD_WORKING_AREA`.
- The application shall not use `malloc`, `free`, or another dynamic memory allocator.
- ECU1 analogue acquisition shall use **ADC1 with DMA**.
- The application shall use ChibiOS synchronization and timing primitives rather than busy-wait loops.
- The inter-ECU application protocol shall use a packed C representation and fixed-width integer types.
- The design shall preserve a logical separation between acquisition, communication, physics, and telemetry execution contexts.

### 2.6 Assumptions and Dependencies

- Both ECUs use a compatible clock configuration and UART baud rate.
- The two boards share a common electrical ground.
- The joystick output voltage remains within the STM32 analogue-input range.
- The host PC is used only for observation and does not control the simulated vehicle.
- The serial physical layer is assumed to be electrically reliable for bench operation; application-level integrity checking is required regardless.

---

## 3. Specific Requirements

### 3.1 External Interface Requirements

#### 3.1.1 Hardware Interfaces

| Interface | Signal assignment | Requirement |
|---|---|---|
| Joystick steering | ECU1 PA0 / ADC1_IN1 | Shall provide the steering analogue input. |
| Joystick pedal | ECU1 PA1 / ADC1_IN2 | Shall provide the accelerator/brake analogue input. |
| Inter-ECU UART TX | USART1 on PC4, alternate function 7 | Shall transmit ECU1 command frames to ECU2 PC5. |
| Inter-ECU UART RX | USART1 on PC5, alternate function 7 | Shall receive frames from the peer ECU PC4. |
| Debug UART | ECU2 secondary UART via ST-LINK VCP | Shall provide host-visible telemetry. |
| Ground reference | ECU1 GND to ECU2 GND | Shall be present for any inter-ECU UART operation. |

#### 3.1.2 Communication Interface

The inter-ECU UART shall operate at **115200 bit/s**, 8 data bits, no parity, and 1 stop bit (8-N-1). The physical connection shall use crossed data wires:

- ECU1 PC4 / USART1_TX to ECU2 PC5 / USART1_RX.
- ECU2 PC4 / USART1_TX to ECU1 PC5 / USART1_RX when bidirectional communication is enabled.
- ECU1 GND to ECU2 GND.

#### 3.1.3 User Interface

ECU2 shall expose diagnostic telemetry on the host-facing serial interface as printable ASCII text terminated by `\r\n`. The minimum telemetry content shall include pedal command, engine RPM, and vehicle speed in km/h.

### 3.2 Inter-ECU Packet Protocol Requirements

#### 3.2.1 Packet Layout

The cockpit command packet shall be represented by a C structure declared with `__attribute__((packed))`. Its payload shall contain exactly seven octets.

| Byte offset | Field | C type | Size | Required value / interpretation |
|---:|---|---|---:|---|
| 0-1 | `header` | `uint16_t` | 2 | Fixed value `0xAAAA`; transmitted in the native little-endian representation of the STM32 target. |
| 2-3 | `msg_id` | `uint16_t` | 2 | Fixed value `0x010A`, identifying cockpit command data. |
| 4 | `steer_val` | `int8_t` | 1 | Normalized steering demand in the inclusive range -100 to +100. |
| 5 | `pedal_val` | `int8_t` | 1 | Normalized pedal demand in the inclusive range -100 to +100; positive is throttle and negative is brake. |
| 6 | `crc` | `uint8_t` | 1 | XOR of bytes 0 through 5. |

#### 3.2.2 Packet Integrity and Synchronization

- **COM-REQ-001:** ECU1 shall set `header` to `0xAAAA` and `msg_id` to `0x010A` in every cockpit command frame.
- **COM-REQ-002:** ECU1 shall calculate `crc` as the bitwise XOR of all bytes preceding the CRC field.
- **COM-REQ-003:** ECU2 shall reject any frame with an incorrect header, message ID, or CRC.
- **COM-REQ-004:** ECU2 shall use a byte-wise frame synchronization mechanism that recognizes the two-byte `0xAAAA` preamble and recovers after loss, corruption, or reset-induced stream misalignment.
- **COM-REQ-005:** A rejected frame shall not modify the active steering or pedal targets.
- **COM-REQ-006:** ECU2 shall maintain diagnostic evidence of valid and invalid frames, at minimum as counters available to debug telemetry or test instrumentation.

### 3.3 ECU1 Cockpit Module Requirements

#### 3.3.1 Analogue Acquisition

- **E1-ADC-001:** ECU1 shall configure PA0 as ADC1_IN1 for steering acquisition.
- **E1-ADC-002:** ECU1 shall configure PA1 as ADC1_IN2 for pedal acquisition.
- **E1-ADC-003:** ECU1 shall acquire both channels using **ADC1 and DMA** into a statically allocated buffer of type `adcsample_t` with two elements.
- **E1-ADC-004:** The ADC conversion sequence shall contain the steering channel followed by the pedal channel.
- **E1-ADC-005:** The ADC acquisition implementation shall not synchronously busy-wait for completion of a conversion.

#### 3.3.2 Signal Processing

- **E1-SIG-001:** ECU1 shall interpret raw ADC samples over the range 0 to 4095.
- **E1-SIG-002:** ECU1 shall apply a software centre calibration with a nominal centre value of 2048 ADC counts.
- **E1-SIG-003:** ECU1 shall apply a configurable symmetric deadzone of at least ±100 ADC counts around the calibrated centre.
- **E1-SIG-004:** ECU1 shall normalize each processed channel to a signed integer value in the inclusive range -100 to +100.
- **E1-SIG-005:** ECU1 shall saturate values beyond the configured input range rather than allowing arithmetic overflow or output outside the normalized range.

#### 3.3.3 Command Transmission

- **E1-COM-001:** ECU1 shall transmit one valid cockpit command packet every **20 ms** (50 Hz nominal rate).
- **E1-COM-002:** ECU1 shall obtain the steering and pedal values used in one transmitted packet from a consistent snapshot of the current processed inputs.
- **E1-COM-003:** A temporary UART transmit-queue saturation shall not indefinitely block the cockpit acquisition thread.

### 3.4 ECU2 Powertrain Module Requirements

#### 3.4.1 Command Reception

- **E2-RX-001:** ECU2 shall execute a dedicated ChibiOS receiver thread at normal scheduling priority.
- **E2-RX-002:** The receiver thread shall wait for serial input using a ChibiOS channel operation with a bounded or explicitly managed timeout policy; it shall not poll continuously in a busy loop.
- **E2-RX-003:** ECU2 shall atomically update `target_steer` and `target_pedal` only after a complete, validated cockpit packet is received.

#### 3.4.2 Vehicle Dynamics

- **E2-PHY-001:** ECU2 shall execute a dedicated vehicle-dynamics thread at high ChibiOS scheduling priority.
- **E2-PHY-002:** The vehicle-dynamics thread shall execute at a nominal frequency of **100 Hz** with a 10 ms period.
- **E2-PHY-003:** ECU2 shall constrain `engine_rpm` to the inclusive range **1000 RPM to 8000 RPM**.
- **E2-PHY-004:** For a positive pedal command, ECU2 shall increase engine RPM proportionally to pedal magnitude, subject to the upper RPM limit.
- **E2-PHY-005:** For a zero pedal command, ECU2 shall reduce engine RPM gradually toward idle to simulate coasting and engine braking.
- **E2-PHY-006:** For a negative pedal command, ECU2 shall reduce engine RPM more rapidly than in the coasting case to simulate braking.
- **E2-PHY-007:** ECU2 shall apply bounded incremental RPM changes rather than assigning engine speed instantaneously from pedal demand.
- **E2-PHY-008:** ECU2 shall calculate `vehicle_speed_kmh` from engine RPM using a fixed, configurable transmission factor. The baseline factor shall be 0.025 km/h per RPM.

#### 3.4.3 Communications Fault Response

- **E2-SAF-001:** ECU2 shall treat a communication timeout or an invalid-only reception condition as absence of a fresh driver command.
- **E2-SAF-002:** When no valid cockpit command has been accepted within a configurable watchdog interval, ECU2 shall set the effective pedal command to zero.
- **E2-SAF-003:** Under the condition in E2-SAF-002, ECU2 shall use the coasting model to reduce engine RPM safely toward the idle limit and shall not increase RPM.
- **E2-SAF-004:** Communication faults shall not cause an out-of-range RPM, arithmetic overflow, scheduler lockup, or dynamic-memory allocation.

### 3.5 ECU2 Telemetry Requirements

- **E2-TEL-001:** ECU2 shall execute telemetry generation in a dedicated low-priority ChibiOS thread.
- **E2-TEL-002:** ECU2 shall transmit telemetry at a nominal rate of **10 Hz** (one update every 100 ms).
- **E2-TEL-003:** Each telemetry line shall include the active pedal command, engine RPM, and vehicle speed in km/h.
- **E2-TEL-004:** Telemetry output shall not run in the high-priority vehicle-dynamics thread.
- **E2-TEL-005:** Host telemetry failure or a disconnected terminal shall not prevent execution of the vehicle-dynamics thread.

### 3.6 Real-Time and Performance Requirements

| Identifier | Requirement | Verification method |
|---|---|---|
| PERF-001 | ECU1 command frames shall be scheduled every 20 ms, with a nominal 50 Hz rate. | Logic analyser or timestamped receiver counter. |
| PERF-002 | ECU2 physics iterations shall be scheduled every 10 ms, with a nominal 100 Hz rate. | Instrumented timestamp trace. |
| PERF-003 | ECU2 telemetry shall be scheduled every 100 ms, with a nominal 10 Hz rate. | Host serial timestamp log. |
| PERF-004 | The physics thread shall not invoke blocking serial I/O or wait indefinitely for another thread. | Code inspection and runtime trace. |
| PERF-005 | ADC sampling shall use DMA so CPU execution is not occupied by per-sample transfer polling. | Code inspection and DMA/ADC register trace. |

### 3.7 Reliability, Safety, and Fault Tolerance Requirements

- **REL-001:** All inter-ECU command frames shall be checked for identity and integrity before use.
- **REL-002:** The system shall recover reception framing after a peer reset, late startup, byte corruption, or a dropped byte without requiring a manual reset of ECU2.
- **REL-003:** A malformed frame shall be observable through a diagnostic counter and shall not alter vehicle state targets.
- **REL-004:** Engine RPM shall remain clamped to the specified range in every operating condition, including invalid command values and communications faults.
- **REL-005:** The system shall fail to the simulated idle/coasting state on loss of valid cockpit communication.
- **REL-006:** Debug telemetry is non-safety-critical and shall be isolated from the timing path of command reception and physics calculation.

### 3.8 Resource and Concurrency Requirements

- **RES-001:** All application thread stacks shall be statically reserved using `THD_WORKING_AREA`.
- **RES-002:** ADC/DMA buffers and protocol packet storage shall be statically allocated or allocated with automatic storage duration; heap allocation is prohibited.
- **RES-003:** Shared state accessed by more than one thread shall use appropriate ChibiOS synchronization. Short critical sections may protect atomic snapshots of related values.
- **RES-004:** Critical sections shall be short and shall not contain serial output, ADC conversion waits, or other potentially blocking operations.
- **RES-005:** Periodic execution shall use ChibiOS time services such as `chThdSleepMilliseconds()` or an equivalent deadline-aware mechanism; software delay loops are prohibited.

### 3.9 Verification and Acceptance Criteria

| Test ID | Acceptance criterion |
|---|---|
| ACC-001 | Moving each joystick axis changes the corresponding ECU1 normalized value and keeps it within -100 to +100. |
| ACC-002 | ECU1 transmits valid 7-byte frames at 50 Hz with the required header, message ID, and XOR checksum. |
| ACC-003 | ECU2 accepts valid frames, updates pedal target, and increases RPM for positive pedal demand. |
| ACC-004 | With zero pedal demand, ECU2 returns RPM progressively to 1000 RPM rather than instantaneously. |
| ACC-005 | With negative pedal demand, ECU2 decays RPM faster than during coasting. |
| ACC-006 | A deliberately corrupted CRC does not change ECU2 command targets and increments invalid-frame diagnostics. |
| ACC-007 | Resetting ECU2 while ECU1 is transmitting results in automatic frame re-synchronization and subsequent valid reception. |
| ACC-008 | Disconnecting the ECU1-to-ECU2 transmit wire causes ECU2 to command zero effective pedal demand after the configured watchdog interval and coast to idle. |
| ACC-009 | ECU2 publishes readable telemetry containing pedal, RPM, and speed at 10 Hz while the physics thread continues to run at 100 Hz. |

---

## 4. Appendix A — Requirement Traceability Summary

| Subsystem | Principal requirements |
|---|---|
| ECU1 acquisition | E1-ADC-001 to E1-ADC-005 |
| ECU1 processing | E1-SIG-001 to E1-SIG-005 |
| Inter-ECU protocol | COM-REQ-001 to COM-REQ-006 |
| ECU2 reception | E2-RX-001 to E2-RX-003 |
| ECU2 simulation | E2-PHY-001 to E2-PHY-008 |
| ECU2 fail-safe behaviour | E2-SAF-001 to E2-SAF-004 |
| ECU2 telemetry | E2-TEL-001 to E2-TEL-005 |
| Real-time and resources | PERF-001 to PERF-005; RES-001 to RES-005 |
