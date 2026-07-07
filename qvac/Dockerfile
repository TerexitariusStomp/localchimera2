# Dockerfile for QVAC Chimera — SINGLE container with Node.js + OpenViking
#
# This is the only container. All providers run inline (no Docker-in-Docker).
# CHIMERA_PRIVACY_MODE=true is set so providers switch to inline binary mode:
#   - Golem (yagna), Mysterium (myst), Anyone Protocol (anyone-relay),
#     BTFS (btfs), BTT AI (miner-cli), Routstr (routstr)
#   - Plus inline-safe providers: Casper relay, Earnidle, Chutes, Fortytwo
# All binaries are installed below.

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

# Install Python + runtime deps for OpenViking and provider binaries
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl python3 python3-pip wget gnupg2 iproute2 unzip \
    # Mysterium VPN deps
    wireguard openresolv \
    && rm -rf /var/lib/apt/lists/*

# Install Golem yagna daemon
RUN wget -qO /tmp/yagna.sh https://install.golem.network && \
    bash /tmp/yagna.sh && rm /tmp/yagna.sh

# Install Mysterium node (myst)
RUN wget -qO /tmp/myst.deb https://github.com/mysteriumnetwork/node/releases/latest/download/myst_linux_amd64.deb && \
    dpkg -i /tmp/myst.deb && rm /tmp/myst.deb

# Install Anyone Protocol relay
RUN wget -qO /usr/local/bin/anyone-relay https://github.com/anyone-protocol/anyone/releases/latest/download/anyone-relay-linux-amd64 && \
    chmod +x /usr/local/bin/anyone-relay

# Install BTFS (go-btfs)
RUN wget -qO /tmp/btfs.tar.gz https://github.com/bittorrent/go-btfs/releases/latest/download/btfs-linux-amd64.tar.gz && \
    tar xzf /tmp/btfs.tar.gz -C /usr/local/bin/ btfs && rm /tmp/btfs.tar.gz

# Install Routstr
RUN wget -qO /usr/local/bin/routstr https://github.com/routstr/routstr/releases/latest/download/routstr-linux-amd64 && \
    chmod +x /usr/local/bin/routstr

# Install BTT AI miner-cli (Python package)
RUN pip3 install --no-cache-dir miner-cli

# Install Storj storage node and identity binaries
RUN wget -qO /tmp/storagenode.zip https://github.com/storj/storj/releases/latest/download/storagenode_linux_amd64.zip && \
    unzip -o /tmp/storagenode.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/storagenode && \
    rm /tmp/storagenode.zip && \
    wget -qO /tmp/identity.zip https://github.com/storj/storj/releases/latest/download/identity_linux_amd64.zip && \
    unzip -o /tmp/identity.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/identity && \
    rm /tmp/identity.zip

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

# Scrub machine-id to prevent host identity leakage inside the container
RUN rm -f /etc/machine-id /var/lib/dbus/machine-id && \
    touch /etc/machine-id && \
    echo "" > /etc/machine-id

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
ENV OPENVIKING_API_KEY=""
ENV CHIMERA_PRIVACY_MODE=true
ENV PATH="/app/.venv/bin:${PATH}"

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fs http://localhost:3002/health || exit 1

CMD ["/app/start.sh"]
