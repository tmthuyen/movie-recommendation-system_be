FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml ./
COPY src/ ./src/
COPY config/ ./config/ 

RUN pip install --no-cache-dir -e .

EXPOSE 8082

CMD ["uvicorn", "src.api.web_app:app", "--host", "0.0.0.0", "--port", "8082"]