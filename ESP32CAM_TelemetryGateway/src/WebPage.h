#ifndef RACE_GATEWAY_WEB_PAGE_H
#define RACE_GATEWAY_WEB_PAGE_H

static const char INDEX_HTML[] PROGMEM = R"html(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>HIL Telemetry</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07090e;
      --panel: #111722;
      --line: #2a3347;
      --rpm: #ff3b30;
      --speed: #22d3ee;
      --text: #f7f8fb;
      --muted: #8490a5;
      --online: #35d07f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      color: var(--text);
      font-family: Inter, system-ui, sans-serif;
      background:
        radial-gradient(circle at 50% -20%, #301113 0, transparent 42%),
        linear-gradient(145deg, #040508, var(--bg));
    }
    .dash {
      width: min(920px, 100%);
      padding: 28px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background: rgba(17, 23, 34, .95);
      box-shadow: 0 24px 80px rgba(0, 0, 0, .58);
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }
    h1 {
      margin: 0;
      font-size: clamp(1.1rem, 3vw, 1.65rem);
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: .82rem;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--rpm);
      box-shadow: 0 0 14px var(--rpm);
    }
    .connected .dot {
      background: var(--online);
      box-shadow: 0 0 14px var(--online);
    }
    .gauges {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .gauge {
      min-height: 260px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: linear-gradient(160deg, #181e2a, #0b0f17);
    }
    .label, .unit {
      color: var(--muted);
      font-size: .8rem;
      font-weight: 700;
      letter-spacing: .2em;
      text-transform: uppercase;
    }
    .value {
      margin: 10px 0 14px;
      font-family: Impact, "Arial Narrow", sans-serif;
      font-size: clamp(4.5rem, 13vw, 8rem);
      font-variant-numeric: tabular-nums;
      line-height: .9;
    }
    .rpm .value { color: var(--rpm); text-shadow: 0 0 28px #ff3b3066; }
    .speed .value { color: var(--speed); text-shadow: 0 0 28px #22d3ee55; }
    footer {
      margin-top: 18px;
      color: var(--muted);
      font: .78rem ui-monospace, Consolas, monospace;
      text-align: center;
    }
    @media (max-width: 680px) {
      .dash { padding: 18px; }
      .gauges { grid-template-columns: 1fr; }
      .gauge { min-height: 215px; }
    }
  </style>
</head>
<body>
  <main class="dash">
    <header>
      <h1>HIL Racing Telemetry</h1>
      <div id="status" class="status">
        <span class="dot"></span><span id="statusText">Connecting</span>
      </div>
    </header>
    <section class="gauges">
      <article class="gauge rpm">
        <span class="label">Engine</span>
        <strong id="rpm" class="value">----</strong>
        <span class="unit">RPM</span>
      </article>
      <article class="gauge speed">
        <span class="label">Vehicle speed</span>
        <strong id="speed" class="value">--.-</strong>
        <span class="unit">KM/H</span>
      </article>
    </section>
    <footer id="lastUpdate">Waiting for ECU telemetry</footer>
  </main>
  <script>
    const statusBox = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const rpmBox = document.getElementById('rpm');
    const speedBox = document.getElementById('speed');
    const updateBox = document.getElementById('lastUpdate');
    let socket;

    function connectWebSocket() {
      socket = new WebSocket('ws://192.168.4.1/ws');
      socket.onopen = function () {
        statusBox.classList.add('connected');
        statusText.textContent = 'Live';
      };
      socket.onmessage = function (event) {
        try {
          const data = JSON.parse(event.data);
          rpmBox.textContent = Number(data.rpm).toFixed(0);
          speedBox.textContent = Number(data.speed).toFixed(1);
          updateBox.textContent =
              'Last frame: ' + new Date().toLocaleTimeString();
        } catch (error) {
          console.error('Invalid telemetry JSON', error);
        }
      };
      socket.onclose = function () {
        statusBox.classList.remove('connected');
        statusText.textContent = 'Reconnecting';
        window.setTimeout(connectWebSocket, 1000);
      };
      socket.onerror = function () {
        socket.close();
      };
    }

    connectWebSocket();
  </script>
</body>
</html>
)html";

#endif
