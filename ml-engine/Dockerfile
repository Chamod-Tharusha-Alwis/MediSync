FROM python:3.11-slim@sha256:b95327ce1439e687237841b0210677aeadd62d55a060a5f6bcb9c15bf6251dd3
WORKDIR /app

# Reviewed wheel set targets CPython 3.11 / Linux amd64. No floating apt or
# source-build compiler toolchain; actual clean-image imports remain gated.
COPY requirements.txt requirements.lock requirements-artifacts.json ./
RUN python -c "import platform,sys; assert sys.version_info[:2] == (3,11) and platform.machine() == 'x86_64'"
RUN pip install --no-cache-dir --require-hashes --only-binary=:all: -r requirements.lock

COPY . .
# Verify reference delivery using stdlib only; no application/SQLite/seed startup.
RUN python reference_catalog.py --verify
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 5001
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5001} --workers 1 --threads 4 --timeout 120 app:app"]
