# Simulation to Production Roadmap: Google Cloud Platform (GCP)

This document provides a guide for translating our local OpenTelemetry agent telemetry simulation into a scalable, production-grade deployment on **Google Cloud Platform (GCP)** using the native Google Cloud Operations Suite (formerly Stackdriver).

---

## 🗺️ Production Architecture

In a production environment, the in-memory metric collector is replaced by the standard **OpenTelemetry Collector** or the **Google Cloud Ops Agent**, which natively pushes telemetry to Cloud Trace, Cloud Logging, and Cloud Monitoring.

```mermaid
graph TD
    subgraph FastAPI Agent Service (GKE / Cloud Run)
        ADK[Google Native ADK] -->|Auto-Generated Spans & Histograms| OTelSDK[OTel SDK Provider]
        OTelSDK -->|OTLP GRPC / Port 4317| OTelColl[OTel Collector Daemon]
    end

    subgraph Google Cloud Operations Suite
        OTelColl -->|Trace Export| GCTrace[Google Cloud Trace]
        OTelColl -->|Metrics Export| GCMonitor[Google Cloud Monitoring]
        OTelColl -->|Logs Export| GCLogging[Google Cloud Logging]
    end
```

---

## 🛠️ Step 1: OpenTelemetry Collector Configuration

In production, run the OpenTelemetry Collector as a daemon or sidecar container (e.g., in Google Kubernetes Engine). Configure it with the `googlecloud` exporter.

Here is a production-grade `otel-collector-config.yaml` snippet:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    send_batch_size: 8192
    timeout: 5s
  memory_limiter:
    check_interval: 1s
    limit_percentage: 75
    spike_limit_percentage: 15

exporters:
  googlecloud:
    project: "your-gcp-project-id"
    # Credentials are automatically inherited via GCP Workload Identity / Service Account
    metric:
      prefix: "custom.googleapis.com/"
    trace:
      # Automatically maps OTel spans to Cloud Trace format

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [googlecloud]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [googlecloud]
```

---

## ⚙️ Step 2: Live Production SDK Setup (Python)

To connect the Google ADK runner to GCP, initialize the OTel provider to export to the collector endpoint configured in Step 1 instead of our demo `InMemoryMetricReader`.

Install the required packages in your production environment:
```bash
pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp
```

Add the following initialization code at the very entrypoint of your application (e.g., `main.py` before any ADK imports):

```python
import os
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPTraceExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource

# 1. Define Service Resources
resource = Resource(attributes={
    "service.name": "vertex-agent-service",
    "service.namespace": "production-billing",
    "service.version": "1.4.0",
    "cloud.provider": "gcp",
    "cloud.platform": "gcp_kubernetes_engine"
})

# 2. Setup Trace Exporter
otlp_collector_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:4317")

tracer_provider = TracerProvider(resource=resource)
trace_exporter = OTLPTraceExporter(endpoint=otlp_collector_endpoint, insecure=True)
tracer_provider.add_span_processor(BatchSpanProcessor(trace_exporter))
trace.set_tracer_provider(tracer_provider)

# 3. Setup Metric Exporter
metric_exporter = OTLPMetricExporter(endpoint=otlp_collector_endpoint, insecure=True)
metric_reader = PeriodicExportingMetricReader(metric_exporter, export_interval_millis=15000)
meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
metrics.set_meter_provider(meter_provider)

# 4. Access Meter
meter = metrics.get_meter("gcp.vertex.agent")
# All ADK operations will now export directly to Google Cloud!
```

---

## 📈 Step 3: Google Cloud Monitoring Dashboards

Once OTel metrics are exported via the `googlecloud` exporter, they will be registered in GCP. To locate them:
1. In the GCP Console, go to **Monitoring** > **Metrics Explorer**.
2. Search for the metric prefix: `custom.googleapis.com/gen_ai.agent.invocation.duration` or `custom.googleapis.com/gen_ai.tool.calls.count`.
3. Filter by resource labels such as `gen_ai.agent.name`, `gen_ai.tool.name`, or GKE pod namespaces.

### Recommended Production Alerts:
* **LLM Engine Latency Spike**: Set a threshold alert on `gen_ai.model.response.latency` p95 > 2500ms.
* **Agent Call Error Rate**: Alert when `gen_ai.agent.errors.count` rates exceed 1% over a 5-minute rolling window.
* **Tool Cache Miss Spike**: Alert when `gen_ai.tool.cache.miss` rate exceeds 90% (indicates cache/database connection failure).
* **Token Budget Control**: Monitor `gen_ai.agent.token.total` to prevent unexpected billing costs.
