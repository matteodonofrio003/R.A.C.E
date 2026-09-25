#ifndef RACE_CLUSTER_DISPLAY_H
#define RACE_CLUSTER_DISPLAY_H

#include "TelemetryProtocol.h"

void clusterDisplayBegin(void);
void clusterDisplayUpdate(const TelemetryPacket *packet);
void clusterDisplayShowNoTelemetry(void);

#endif
