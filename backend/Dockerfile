# Build from repo root: docker build -f backend/Dockerfile -t bharini-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# libpq for psycopg2, libglib for opencv-headless
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .
RUN DJANGO_SECRET_KEY=build-only python manage.py collectstatic --noinput \
    && useradd --uid 10001 --no-create-home app
USER app

EXPOSE 8000
# Same image runs migrations / scheduled jobs: override CMD, e.g. ["python", "manage.py", "migrate", "--noinput"]
CMD ["gunicorn", "bharini.wsgi", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--access-logfile", "-"]
