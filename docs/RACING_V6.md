# R.A.C.E. - Persistent timing and cockpit camera

This revision makes lap completion tolerant of coarse or skipped track
projections, persists timing records in the browser, and adds a driver-eye
cockpit camera styled for the Ferrari 458 Italia used by the chase view.

## Lap timing

- The lap detector uses sixteen ordered virtual gates around the closed
  circuit. A physics update may cross more than one gate without losing the
  lap, while reverse travel and implausible projection jumps cannot create a
  false completion.
- Leaving the circuit invalidates the current lap but does not freeze its
  checkpoint sequence. Crossing the finish line after all gates therefore
  still increments **Completed laps** and records **Last lap** with an
  invalid marker. Only clean laps may update **Best valid lap**.
- Completed laps, last lap and best valid lap are written immediately to the
  browser `localStorage` key `race-lap-records-v1`. They survive page reloads,
  reconnects, and **New session**. Current lap time, distance and session
  average are intentionally reset for a new session.
- **Controls / diagnostics > Reset lap records** removes all persisted lap
  records after confirmation.

Browser storage is scoped to the page origin. Opening the game from a
different host name, port, browser profile, or private browsing session uses
a different record set.

## Driver-eye camera

Use **Cockpit view [C]** or press `C` to switch between chase and first-person
views. The selected camera mode is remembered in `race-camera-v1`.

The first-person view includes a leather and carbon dashboard, red stitching,
a compact Ferrari-inspired steering wheel with paddle shifters, coloured
controls and yellow `SF` badge, start button, air vents, red bonnet, and a live
digital instrument panel. The raised driver eye looks slightly down the road;
the wheel remains below the track horizon and follows the normalized joystick
command. The instrument display shows speed, RPM, total completed laps and
current lap time. The external speed HUD is hidden in cockpit mode to avoid
duplicating the in-car instruments.

## Verification

The deterministic host test covers ordered gates, skipped sectors, reverse
motion, invalid laps, persistence snapshots and session reset behaviour:

```text
node --test tests/racing-core.test.mjs
```

The Playwright smoke test preloads persisted records, checks that **New
session** preserves them, switches between both cameras, verifies the WebGL
scene, and captures desktop, cockpit and mobile screenshots:

```text
node tests/browser-smoke.cjs
```

No embedded firmware or UART packet change is required for this revision.
Serve the repository root with the existing VS Code Live Server and refresh
that game tab. `http://192.168.4.1/` remains the lightweight telemetry page
embedded in the ESP32 firmware; it is not the Three.js racing game.
