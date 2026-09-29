from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from fastapi import FastAPI

from .config import Settings
from utils import setup_logger
logger = setup_logger(name="FastAPI-Recommendations", filename=__name__)

def configure_tracing(app: FastAPI, settings: Settings) -> None:
    if not settings.otel_enabled:
        logger.warning("Telemetry disabled")
        return
    provider = TracerProvider(
        resource=Resource.create({"service.name": settings.service_name})
    )
    provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=f"{settings.otel_exporter_url}/v1/traces")
        )
    )
    trace.set_tracer_provider(provider)

    logger.info(f"Tracing enabled: endpoint={settings.otel_exporter_url}")
    FastAPIInstrumentor().instrument_app(app)
    RequestsInstrumentor().instrument()
