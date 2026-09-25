#include <Arduino.h>
#include "ClusterDisplay.h"
#include "TelemetryReceiver.h"

void setup(void) {
  Serial.begin(115200);
  clusterDisplayBegin();
  telemetryReceiverBegin();
}

void loop(void) {
  telemetryReceiverPoll();
}
