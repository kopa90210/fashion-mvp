FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    WORKER_HEALTH_PORT=8080

WORKDIR /app

COPY ai_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY ai_service ./ai_service

EXPOSE 8080

CMD ["python", "-m", "ai_service.worker", "--poll-seconds", "2", "--heartbeat-seconds", "60"]
