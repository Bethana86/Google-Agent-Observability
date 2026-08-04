import logging
from typing import Optional
from opentelemetry import metrics, trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from config import settings

logger = logging.getLogger("production_exporter")

def setup_production_telemetry(meter_provider: MeterProvider) -> bool:
    """Configures production OTLP exporter if endpoint is configured.
    
    Returns:
        bool: True if OTLP exporter was successfully attached.
    """
    if not settings.is_otlp_enabled:
        logger.info("No OTLP endpoint configured. Running in local InMemoryMetricReader mode.")
        return False
        
    try:
        from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPTraceExporter
        
        endpoint = settings.OTEL_EXPORTER_OTLP_ENDPOINT
        logger.info(f"Initializing OTLP Exporter pointing to: {endpoint}")
        
        # Attach periodic OTLP Metric Reader
        otlp_metric_exporter = OTLPMetricExporter(endpoint=endpoint, insecure=True)
        otlp_reader = PeriodicExportingMetricReader(otlp_metric_exporter, export_interval_millis=10000)
        
        # Attach OTLP Trace Processor
        tracer_provider = TracerProvider()
        otlp_trace_exporter = OTLPTraceExporter(endpoint=endpoint, insecure=True)
        tracer_provider.add_span_processor(BatchSpanProcessor(otlp_trace_exporter))
        trace.set_tracer_provider(tracer_provider)
        
        logger.info("Successfully registered OTLP metric & trace exporters for GCP/Collector forwarding.")
        return True
    except Exception as e:
        logger.warning(f"Could not initialize OTLP exporter ({e}). Falling back to local metric reader.")
        return False
