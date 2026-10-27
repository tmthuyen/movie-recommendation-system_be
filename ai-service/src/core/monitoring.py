import os
import threading

import psutil
from fastapi import FastAPI
from prometheus_client import Gauge
from prometheus_fastapi_instrumentator import Instrumentator

from utils.logger import setup_logger

logger = setup_logger(name="FastAPI-Recommendations", filename=__name__)


def configure_monitoring(app: FastAPI) -> None:
    """
    Configure Prometheus monitoring for the FastAPI application.
    """
    instrumentator = Instrumentator(
        should_group_status_codes=False,
        should_ignore_untemplated=True,
        should_instrument_requests_inprogress=True,
        should_respect_env_var=False,  # Always enable monitoring, ignore env var
        env_var_name="ENABLE_METRICS",
    )

    instrumentator.instrument(app)

    # api/recommendations/metrics
    instrumentator.expose(app, endpoint=f"/api/metrics")

    logger.info("Prometheus monitoring configured at /api/metrics")


cpu_usage = Gauge("system_cpu_usage_percent", "System CPU usage (%)")
memory_usage = Gauge("system_memory_usage_percent", "System RAM usage (%)")
memory_total = Gauge("system_memory_total_bytes", "System total physical memory")
memory_available = Gauge("system_memory_available_bytes", "System available memory")
app_memory = Gauge("app_memory_usage_bytes", "AI service RAM usage")
disk_usage = Gauge("system_disk_usage_percent", "Disk usage (%)")

process = psutil.Process()


def update_metrics(stop_event: threading.Event):
    psutil.cpu_percent(interval=None)

    while not stop_event.is_set():
        mem = psutil.virtual_memory()
        cpu_usage.set(psutil.cpu_percent(interval=0.1))
        memory_usage.set(mem.percent)
        memory_total.set(mem.total)
        memory_available.set(mem.available)
        app_memory.set(process.memory_info().rss)
        disk_usage.set(psutil.disk_usage("/").percent)

        stop_event.wait(5)


def check_infra():
    mem = psutil.virtual_memory()
    process = psutil.Process()

    print("PID:", os.getpid())
    print("Total RAM:", round(mem.total / 1024**3, 2), "GiB")
    print("Available RAM:", round(mem.available / 1024**3, 2), "GiB")
    print("Used Percent:", mem.percent, "%")
    print("App RSS:", round(process.memory_info().rss / 1024**3, 2), "GiB")

    res = {
        "pid": os.getpid(),
        "total_ram_gb": round(mem.total / 1024**3, 2),
        "available_ram_gb": round(mem.available / 1024**3, 2),
        "used_percent": mem.percent,
        "app_rss_gb": round(process.memory_info().rss / 1024**3, 2),
    }
    return res
