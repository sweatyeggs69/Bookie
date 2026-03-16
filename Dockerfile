# ── Stage 1: Build React frontend ─────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ .
RUN npm run build

# ── Stage 2: Build Python deps ─────────────────────────────
FROM python:3.12-slim AS py-builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libmagic1 \
    libjpeg-dev \
    zlib1g-dev \
    libxml2-dev \
    libxslt1-dev \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 3: Runtime ───────────────────────────────────────
FROM python:3.12-slim

LABEL org.opencontainers.image.title="Bookie"
LABEL org.opencontainers.image.description="Self-hosted ebook manager"
LABEL org.opencontainers.image.licenses="MIT"

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    libjpeg62-turbo \
    zlib1g \
    libxml2 \
    libxslt1.1 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=py-builder /install /usr/local

WORKDIR /app

COPY app.py models.py auth.py scraper.py covers.py mailer.py renamer.py ./
COPY templates/ templates/
COPY static/ static/
# React build output (goes into static/dist/)
COPY --from=frontend-builder /app/static/dist ./static/dist

RUN mkdir -p data/books data/covers

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/app/data \
    FLASK_APP=app.py

EXPOSE 5000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/')" || exit 1

CMD ["gunicorn", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "2", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "app:create_app()"]
