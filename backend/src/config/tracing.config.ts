// tracing.ts (đặt ở root src/, import đầu tiên trong main.ts)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const OTLP_EXPORTER_URL =
  process.env.OTEL_EXPORTER_URL || 'http://localhost:4318';
const traceExporter = new OTLPTraceExporter({
  url: OTLP_EXPORTER_URL + '/v1/traces',
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME || 'backend-service',
  }),
  traceExporter: traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // rác log
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('SDK shut down successfully'))
    .catch(error => console.log('Error shutting down SDK', error))
    .finally(() => process.exit(0));
});
