# Edge Network as an Event Bus

Edge Network is more than a CDN. Its stack includes a WebSocket link layer and an XE blockchain that can be used for decentralized messaging and state.

## Edge Network components

| Component | What it does | Relevance to event bus |
|-----------|--------------|------------------------|
| **CDN** | Static asset delivery, media streaming | Caching and asset distribution |
| **`@edge/link`** | Cryptographically authenticated WebSocket layer | P2p control-plane messaging between worker and activities |
| **XE Blockchain** | Layer 1 that coordinates the network | Settlement, identity, and lightweight on-chain state |

## `@edge/link` for event bus

`@edge/link` is a trust-minimized WebSocket session layer.

**What it gives you:**
- Authenticated WebSocket connections using cryptographic identities.
- Broadcast or direct messages between clients.
- Minimal protocol: two handshake messages, then JSON.
- Server API: `broadcast(msg)`, `send(id, msg)`, `clients()`.
- Client API: `send(msg)`, events for `message`, `heartbeat`, `disconnect`, `reconnect`.

**How it fits the deployment flow:**
- Worker runs an `@edge/link` server.
- Each Golem activity connects to it as a client over the Mysterium tunnel.
- Activities send telemetry messages directly to the worker.
- Worker broadcasts scale commands back to activities.

```js
// Server: worker
import { createServer } from '@edge/link';
const server = createServer({ ... });
server.on('message', (client, msg) => {
  if (msg.type === 'telemetry') {
    // forward to Streamr for persistence
    publishTelemetry(msg);
  }
});

// Client: Golem activity
import { createClient } from '@edge/link';
const client = createClient({ serverAddress: 'wss://...' });
client.on('message', (msg) => {
  if (msg.type === 'scale') adjustInstanceCount(msg);
});
client.send({ type: 'telemetry', cpu: 0.8 });
```

## Comparison with Streamr

| Capability | Streamr | `@edge/link` |
|------------|---------|--------------|
| Persistent event log | Yes | No |
| Decentralized pub/sub | Yes | P2p with authenticated relay |
| Low-latency control | Moderate | Excellent |
| On-chain payment | DATA token | Uses XE network indirectly |
| State reconstruction | Replay events | Must persist snapshots yourself |
| Maturity | Production | Newer |

## Recommendation

Use both:

- **Streamr** is the canonical event log. It stores provisioning, scaling, and telemetry events durably.
- **`@edge/link`** is the low-latency control plane between the worker and running Golem activities.

For example:

1. Golem activity boots and connects to the worker via `@edge/link`.
2. Activity sends telemetry through `@edge/link`.
3. Worker writes the telemetry event to Streamr.
4. Scaling controller reads Streamr and decides to scale.
5. Worker sends scale command to activity via `@edge/link`.

## What Edge Network does not provide

Edge Network is not a general-purpose object database. For durable snapshots and manifests, continue using **BTFS** and **Edge Network CDN**.

## Implementation path

1. Add `@edge/link` to the worker and Golem activity images.
2. Run the link server inside the worker.
3. Expose the link endpoint through the Mysterium tunnel.
4. Have Golem activities connect on boot and send telemetry.
5. Use Streamr for the durable event stream.
