# server/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose a default port for documentation, though Azure will use the one in CMD
EXPOSE 8000

# ⭐ FIX: Bind Gunicorn to the port specified by the PORT environment variable,
# defaulting to 8000 if it's not set.
CMD sh -c 'gunicorn -k uvicorn.workers.UvicornWorker -w 1 -b 0.0.0.0:${PORT:-8000} main:app'