# Dockerfile for QVAC Chimera — single container with Node.js + OpenViking

# ─── Stage 1: OpenViking build ───
FROM ghcr.io/volcengine/openviking:latest AS openviking-builder

# Already has openviking + venv at /app/.venv
# We just keep this stage as-is for copying later

# ─── Stage 2: Node.js build ───
FROM node:20-bookworm AS node-builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 make g++ cmake bash curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install && \
    find node_modules -path "*/prebuilds/android-*" -delete && \
    find node_modules -path "*/prebuilds/ios-*" -delete && \
    find node_modules -path "*/prebuilds/darwin-*" -delete && \
    find node_modules -path "*/prebuilds/win32-*" -delete && \
    find node_modules -path "*/prebuilds/linux-arm64" -delete && \
    rm -rf node_modules/.cache 2>/dev/null || true

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

COPY src/ ./src/
COPY config.json ./

# ─── Stage 3: Runtime — everything in one container ───
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Install Python + runtime deps for OpenViking
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r chimera && useradd -r -g chimera -s /bin/false chimera

# Copy Node.js app from node-builder
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/frontend/dist ./frontend/dist
COPY --from=node-builder /app/src ./src
COPY --from=node-builder /app/config.json ./
COPY --from=node-builder /app/package.json ./

# Copy OpenViking Python environment from openviking-builder
COPY --from=openviking-builder /app/.venv /app/.venv
COPY --from=openviking-builder /app/.openviking /app/.openviking

# Copy custom ov.conf (overwrites default)
COPY upstream/openviking/ov.conf /app/.openviking/ov.conf

# Ensure OpenViking data dir exists and is writable
RUN mkdir -p /app/.openviking/data /app/llmwiki-data/wiki /app/llmwiki-data/index /app/data \
    && chown -R chimera:chimera /app

# Startup script that runs both OpenViking and Node.js
COPY <<'STARTUP' /app/start.sh
#!/usr/bin/env bash
set -e

# Start OpenViking server in background
/app/.venv/bin/openviking-server \
  --config /app/.openviking/ov.conf \
  --host 127.0.0.1 \
  --port 1933 &
OV_PID=$!
echo "[start] OpenViking PID: $OV_PID"

# Wait for OpenViking to be ready
for i in {1..60}; do
  if curl -fsS http://127.0.0.1:1933/health >/dev/null 2>&1; then
    echo "[start] OpenViking ready"
    break
  fi
  if ! kill -0 $OV_PID 2>/dev/null; then
    echo "[start] OpenViking exited unexpectedly"
    exit 1
  fi
  sleep 1
done

# Start the main Chimera Node.js app
exec node src/index.js
STARTUP
RUN chmod +x /app/start.sh && chown chimera:chimera /app/start.sh

USER chimera

ENV NODE_ENV=production
ENV PORT=3002
ENV OPENVIKING_URL=http://127.0.0.1:1933
ENV OPENVIKING_API_KEY=chimera-local-dev-key
ENV PATH="/app/.venv/bin:${PATH}"

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -fs http://localhost:3002/api/status || exit 1

CMD ["/app/start.sh"]
