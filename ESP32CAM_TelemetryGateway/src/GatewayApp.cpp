#include <Arduino.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <math.h>
#include <string.h>
#include "GatewayApp.h"
#include "WebPage.h"

#define TELEMETRY_RX_PIN          13
#define TELEMETRY_TX_PIN          14
#define TELEMETRY_BAUD_RATE       38400UL
#define TELEMETRY_HEADER          0xBDBDU
#define WIFI_AP_SSID              "HIL_Telemetry"
#define WIFI_AP_PASSWORD          "12345678"
#define WS_CLEANUP_PERIOD_MS      1000UL

typedef struct __attribute__((packed)) {
  uint16_t header;
  uint16_t rpm;
  float speed_kmh;
  int8_t steer;
  uint8_t gear;
  uint8_t flags;
  uint16_t session;
  uint8_t crc;
} TelemetryPacket;

static_assert(sizeof(TelemetryPacket) == 14U,
              "Unexpected TelemetryPacket layout");

static HardwareSerial telemetrySerial(1);
static AsyncWebServer server(80);
static AsyncWebSocket ws("/ws");

static TelemetryPacket receivedPacket;
static size_t receivedIndex = 0U;
static char latestJson[192] = {0};
static portMUX_TYPE feedbackMux = portMUX_INITIALIZER_UNLOCKED;
static uint32_t feedbackOwner = 0U;
static uint32_t feedbackReceivedMs = 0U;
static bool feedbackActive = false, offtrackRequested = false;
static uint16_t requestedSession = 0U, ecuSession = 0U;
static bool ecuSessionKnown = false;
static unsigned long lastFeedbackTxMs = 0UL, lastUartByteMs = 0UL;
static uint32_t validPacketCount = 0U;
static uint32_t invalidPacketCount = 0U;
static unsigned long lastWsCleanupMs = 0UL;

static uint8_t calculateCrc(const uint8_t *data, size_t length) {
  uint8_t crc = 0U;

  while (length > 0U) {
    crc ^= *data++;
    length--;
  }

  return crc;
}

static bool telemetryPacketIsValid(const TelemetryPacket *packet) {
  const uint8_t expectedCrc =
      calculateCrc((const uint8_t *)packet,
                   sizeof(TelemetryPacket) - sizeof(packet->crc));

  return (packet->header == TELEMETRY_HEADER) &&
         (packet->rpm >= 1000U) &&
         (packet->rpm <= 8000U) &&
         isfinite(packet->speed_kmh) &&
         (packet->speed_kmh >= 0.0f) && (packet->speed_kmh <= 360.0f) &&
         (packet->steer >= -100) && (packet->steer <= 100) &&
         (packet->gear >= 1U) && (packet->gear <= 6U) && (packet->flags <= 7U) &&
         (expectedCrc == packet->crc);
}

static void publishTelemetry(const TelemetryPacket *packet) {
  portENTER_CRITICAL(&feedbackMux);
  ecuSession = packet->session;
  ecuSessionKnown = true;
  portEXIT_CRITICAL(&feedbackMux);
  snprintf(latestJson, sizeof(latestJson),
           R"json({"rpm":%u,"speed":%.1f,"steer":%d,"gear":%u,"cockpit":%s,"session":%u,"feedback":%s,"alarm":%s})json",
           (unsigned int)packet->rpm, (double)packet->speed_kmh,
           (int)packet->steer, (unsigned int)packet->gear,
           (packet->flags & 2U) ? "true" : "false", (unsigned)packet->session,
           (packet->flags & 4U) ? "true" : "false",
           (packet->flags & 1U) ? "true" : "false");
  ws.textAll(latestJson);
}

static void processReceivedByte(uint8_t byte) {
  uint8_t *packetBytes = (uint8_t *)&receivedPacket;

  packetBytes[receivedIndex++] = byte;
  if (receivedIndex == sizeof(TelemetryPacket)) {
    if (telemetryPacketIsValid(&receivedPacket)) {
      validPacketCount++;
      publishTelemetry(&receivedPacket);
      receivedIndex = 0U;
    }
    else {
      invalidPacketCount++;
      memmove(packetBytes, packetBytes + 1U, sizeof(TelemetryPacket) - 1U);
      receivedIndex--;
    }

  }
}

static void processTelemetryUart(void) {
  if ((millis() - lastUartByteMs) > 30UL) receivedIndex = 0U;
  while (telemetrySerial.available() > 0) {
    lastUartByteMs = millis();
    processReceivedByte((uint8_t)telemetrySerial.read());
  }
}

static void handleWebSocketEvent(AsyncWebSocket *serverInstance,
                                 AsyncWebSocketClient *client,
                                 AwsEventType type,
                                 void *arg,
                                 uint8_t *data,
                                 size_t length) {
  (void)serverInstance;
  if (type == WS_EVT_DATA) {
    AwsFrameInfo *info = (AwsFrameInfo *)arg;
    const char on[] = R"json({"offtrack":true,"session":)json";
    const char off[] = R"json({"offtrack":false,"session":)json";
    if (!info->final || info->index != 0U || info->len != length ||
        info->opcode != WS_TEXT) return;
    if (length >= 80U) return;
    bool isOn = (length > sizeof(on)) && (memcmp(data, on, sizeof(on) - 1U) == 0);
    bool isOff = (length > sizeof(off)) && (memcmp(data, off, sizeof(off) - 1U) == 0);
    if (!isOn && !isOff) return;
    size_t start = isOn ? sizeof(on) - 1U : sizeof(off) - 1U;
    uint32_t session = 0U;
    if (length - start < 2U || length - start > 6U || data[length - 1U] != '}') return;
    for (size_t i = start; i < length - 1U; i++) {
      if (data[i] < '0' || data[i] > '9') return;
      session = session * 10U + data[i] - '0';
    }
    if (session > 65535U) return;
    uint32_t now = millis();
    portENTER_CRITICAL(&feedbackMux);
    /* One driving page owns feedback until its 500 ms heartbeat lease expires. */
    if (!feedbackActive || (now - feedbackReceivedMs > 500U) ||
        (feedbackOwner == client->id())) {
      feedbackOwner = client->id();
      feedbackReceivedMs = now;
      feedbackActive = true;
      offtrackRequested = isOn;
      requestedSession = (uint16_t)session;
    }
    portEXIT_CRITICAL(&feedbackMux);
  }
  else if (type == WS_EVT_DISCONNECT) {
    portENTER_CRITICAL(&feedbackMux);
    if (feedbackOwner == client->id()) {
      feedbackActive = false;
      offtrackRequested = false;
    }
    portEXIT_CRITICAL(&feedbackMux);
  }
}

static void sendGameFeedback(void) {
  unsigned long now = millis();
  if ((now - lastFeedbackTxMs) < 100UL) return;
  lastFeedbackTxMs = now;
  portENTER_CRITICAL(&feedbackMux);
  bool active = feedbackActive && ((now - feedbackReceivedMs) <= 500UL);
  bool offtrack = active && offtrackRequested;
  bool known = ecuSessionKnown;
  uint16_t session = active ? requestedSession : ecuSession;
  portEXIT_CRITICAL(&feedbackMux);
  if (!known) return;
  uint8_t packet[6] = {0xCDU, 0xCDU, (uint8_t)offtrack,
                       (uint8_t)session, (uint8_t)(session >> 8), 0U};
  packet[5] = calculateCrc(packet, 5U);
  if (telemetrySerial.availableForWrite() >= (int)sizeof(packet)) {
    telemetrySerial.write(packet, sizeof(packet));
  }
}

void gatewaySetup(void) {
  Serial.begin(115200);
  telemetrySerial.begin(TELEMETRY_BAUD_RATE, SERIAL_8N1,
                        TELEMETRY_RX_PIN, TELEMETRY_TX_PIN);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(WIFI_AP_SSID, WIFI_AP_PASSWORD);

  ws.onEvent(handleWebSocketEvent);
  server.addHandler(&ws);
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/html", INDEX_HTML);
  });
  server.begin();
}

void gatewayLoop(void) {
  processTelemetryUart();
  sendGameFeedback();

  const unsigned long now = millis();
  if ((now - lastWsCleanupMs) >= WS_CLEANUP_PERIOD_MS) {
    lastWsCleanupMs = now;
    ws.cleanupClients();
  }
}
