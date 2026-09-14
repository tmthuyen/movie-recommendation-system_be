from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from .config import Settings


def configure_tracing(settings: Settings) -> None:
    if not settings.otel_enabled:
        return
    provider = TracerProvider(resource=Resource.create({"service.name": settings.service_name}))
    provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=f"{settings.otel_exporter_url}/v1/traces")
        )
    )
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor().instrument()