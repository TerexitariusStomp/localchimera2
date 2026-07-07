# Resource Provisioner Worker

Background worker that converts Request Network payments into tasking-network resources.

## Production architecture

```
User
  │
  ▼
User-owned domain (Namesilo) → Edge Network CDN
  │
  ▼
Mysterium tunnel / ingress gateway
  │
  ▼
Golem activities (compute / inference / deployments)
  │
  ├── BTFS (durable storage)
  ├── Edge Network CDN + `@edge/link` (edge key-value + control plane)
  ├── Streamr (real-time telemetry + state events)
  ├── Web3Auth (EVM wallet / escrow / identity)
  └── Casper (Casper wallet / escrow / identity)
```

## How it works

1. The static frontend creates a Request Network payment request and pays it.
2. The frontend records the order in Cloudflare KV via `/api/billing/order-resource`.
3. This worker polls KV for `pending_conversion` orders.
4. For each paid order:
   - Verify the Request Network request is paid.
   - The on-chain `ChimeraBridgeDispatcher` (Li.Fi) handles token bridging and conversion to the tasking network's native token.
   - Call the resource-specific provisioner.
   - Publish deployment state and telemetry to Streamr.
   - Update the order status to `provisioned` or `failed`.

## Supported resources

| Resource | Token | Provisioning method | Notes |
|----------|-------|---------------------|-------|
| Golem Compute | GLM | `golem-js` | Polygon; also used for deployments and rentals |
| BTFS Storage | WBTT | BTFS daemon API | BTTC vault payments |
| Mysterium Bandwidth | MYST | Mysterium node API | Used for ingress tunnels |
| BTT AI Inference | BTT | BTTInferGrid API | BTTC |
| Casper Compute | CSPR | Casper deploys | Smart-contract coordination |

## Generate local keys

Some credentials can be generated automatically:

```bash
cd workers/resource-provisioner
cp .env.example .env.local
node scripts/setup-env.js .env.local
```

This generates:
- `STREAMR_NODE_PRIVATE_KEY`
- `STREAMR_STREAM_ID`
- `GOLEM_API_KEY` (if Yagna is running locally)

You still need to manually add Cloudflare, Edge Network, Namesilo API key, and the protocol `PRIVATE_KEY`.

## Run locally

```bash
cd workers/resource-provisioner
npm install
cp .env.example .env
# fill in required secrets
npm run dev
```

## Run with Docker

```bash
cd workers/resource-provisioner
docker build -t resource-provisioner .
docker run --env-file .env resource-provisioner
```

## Deploy

For production, use the Docker Compose stack:

```bash
cd workers/resource-provisioner
cp .env.example .env
# fill in all required API keys
./deploy.sh
```

This starts:
- The resource provisioner worker
- A Mysterium node sidecar
- A BTFS node sidecar
- A Streamr broker node sidecar

Check logs:
```bash
docker compose logs -f resource-provisioner
```

## Domains

The inference frontend already has Cloudflare Functions for domain registration and DNS via Namesilo:

- `POST /api/domains/search` — check availability
- `POST /api/domains/register` — register a user-owned domain
- `POST /api/domains/records/edit` — add DNS records

The resource provisioner reads the domain from the order and adds a DNS record pointing it to the Mysterium tunnel endpoint. Domain ownership stays with the user.

## Scaling with Streamr

Streamr is the scaling backbone for the deployment flow:

- The worker publishes `provisioned` and `state-update` events to a Streamr stream.
- `src/scaling-controller.js` reads deployment state and publishes `scale`/`scale-down` events via Streamr.
- A Streamr broker node runs as a Docker Compose sidecar.

This makes scaling observable and reproducible from the Streamr event log.

## Notes on SDKs

The current stubs use HTTP APIs where possible to avoid heavy native dependencies. For production, you may want to swap these to official SDKs:

- **Edge Network**: `@edge/link` (requires Node.js native build tools)
- **Streamr**: `streamr-client` (requires `node-datachannel`, which needs OpenSSL + cmake)

Install these only if the runtime environment has OpenSSL headers and cmake. Otherwise, use the HTTP API stubs.
