# ── Python ML Inference Worker ────────────────────────────────────
# tensorflow==2.15.1 requires Python 3.8-3.11
FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2 + TF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy ML source (models and pipeline are mounted as volumes)
COPY ml/inference_worker.py .
COPY ml/utils.py* ./

# Point dotenv loader to a stub (DB config comes from environment variables)
# The worker reads DB_HOST etc. directly from os.getenv, so env vars override .env file
ENV PYTHONUNBUFFERED=1

CMD ["python", "inference_worker.py"]
