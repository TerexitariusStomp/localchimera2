# Chimera SDK

Integrate local AI mining into your application. Your users earn revenue from idle inference tasks. You earn a percentage as the app integrator.

## How payouts work

All tasking network providers mine directly into the **Chimera protocol multisig** (`0x7eB4A545F875FC1Da252661d31a3e28e67bf723f`) — providers never use individual wallet addresses. EVM only.

1. **Mining** — user's device completes tasks on tasking networks (Golem, Mysterium, Anyone Protocol, BTFS, BTT AI, Casper). All rewards flow to the protocol multisig.
2. **Monthly sweep** — the protocol multisig distributes funds to:
   - **Machine owner** Privy wallet (user's embedded wallet via Privy)
   - **App developer** Privy wallet (your address, set in SDK options)
   - Split based on `revenueSplit` config (default 70/30)

Individual Privy wallets are **never used by providers directly** — they only receive funds via the monthly sweep from the protocol multisig.

## What the SDK gives your app

- **Consent prompt** — users opt in before any mining starts
- **Start / Stop controls** — one-click mining controls
- **Miner status** — real-time view of which miners are active
- **Inference API** — OpenAI-compatible `/v1/chat/completions` endpoint (container mode) or in-browser WebGPU/WASM inference (browser mode)
- **SDK auto-update** — checks for newer versions and notifies your app via `sdkUpdate` in the hook

### Two runtime modes

| Mode | When | How it works | Inference |
|------|------|-------------|-----------|
| **Container mode** | Backend / desktop app with Docker | Providers run inside a hardened Docker container with `CHIMERA_PRIVACY_MODE=true` | vLLM/SGLang via container's OpenAI-compatible API |
| **Browser mode** | Website with no backend | `BrowserNode` runs entirely in-browser — WebGPU inference, IPFS storage, WebRTC bandwidth, WASI compute | WebLLM (WebGPU) or transformers.js (WASM) — no API key needed |

The hook auto-detects which mode to use by checking if the backend API is reachable.

Wallet setup, earnings tracking, and revenue distribution are handled on the **Chimera landing page**, not in your app.

## Install

```bash
npm install @chimera/sdk
```

Or copy the `sdk/` folder into your project.

## Quick Start

### React — with Privy wallet integration

The SDK ships with `ChimeraPrivyProvider` — a pre-configured Privy provider using Chimera's app ID (`cmqu05m41000h0djl70k738mx`). It enables social login (Google, email) and auto-generates embedded wallets on login. Wrap your app and call the hook:

```jsx
import { ChimeraPrivyProvider, useChimera } from '@chimera/sdk';

// App root — ChimeraPrivyProvider handles Privy config automatically
function Root() {
  return (
    <ChimeraPrivyProvider>
      <App />
    </ChimeraPrivyProvider>
  );
}

// Inside App — use the hook
function App() {
  const chimera = useChimera({
    appDeveloperEVM: '0xYourEvmWalletAddressHere',
    revenueSplit: { machineOwner: 0.70, appDeveloper: 0.30 },
  });

  return (
    <div>
      {!chimera.walletConnected && (
        <button onClick={chimera.connectWallet}>Connect Wallet</button>
      )}
      {chimera.walletConnected && !chimera.consentGiven && (
        <button onClick={chimera.giveConsent}>Enable Mining</button>
      )}
      {chimera.consentGiven && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={chimera.start} disabled={chimera.status.running}>Start</button>
          <button onClick={chimera.stop} disabled={!chimera.status.running}>Stop</button>
          <button onClick={chimera.revokeConsent}>Revoke</button>
        </div>
      )}
    </div>
  );
}
```

**Social login:** `connectWallet()` triggers Privy's login flow with Google, email, and wallet options. An embedded wallet is auto-created on first login — no browser extension required.

**Protocol app ID:** The SDK uses Chimera's Privy app ID (`cmqu05m41000h0djl70k738mx`) exclusively. All wallets are created under the Chimera protocol.

**Third-party domains:** No Privy dashboard configuration needed. The SDK loads a hidden iframe from `new.localchimera.com/privy-relay.html` that runs the Privy auth flow. Privy sees the allowed origin (`new.localchimera.com`), and the parent app communicates with the iframe via `postMessage`. This works on any domain automatically.

That's it. Your app does **not** collect wallet addresses, show earnings, or handle revenue splits — the Chimera dashboard handles all of that.

### Backend (optional, for server-side control)

```javascript
import { ChimeraSDK } from '@chimera/sdk';

const sdk = new ChimeraSDK({
  appName: 'MyApp',
  appDeveloperEVM: '0xYourEvmWalletAddressHere'
});

await sdk.init();
sdk.giveConsent();
await sdk.start();
```

## What your app should NOT do

| ❌ Don't | ✅ Do instead |
|---|---|
| Ask users for wallet addresses | Show only consent + start/stop |
| Display earnings or revenue splits | Link users to the Chimera dashboard |
| Configure per-chain addresses | Pass only `appDeveloperEVM` — EVM only |
| Handle fund sweeping or distribution | Let the protocol handle it |

## `useChimera` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appDeveloperEVM` | string | `null` | Your EVM payout address |
| `revenueSplit` | object | `{ machineOwner: 0.70, appDeveloper: 0.30 }` | Override split (protocol-level) |

## `ChimeraSDK` options (backend)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appName` | string | `'unknown-app'` | Identifier for logs |
| `appDeveloperEVM` | string | `null` | Your EVM payout address |
| `machineOwnerEVM` | string | `null` | User's EVM payout address |
| `configPath` | string | `./config.json` | Path to provider config |
| `containerImage` | string | `'chimera:latest'` | Docker image for the hardened privacy container |
| `containerPort` | number | `3002` | Host port to expose the container API |

## Hardened Privacy Container (Required)

The SDK runs **exclusively** inside a hardened privacy container. Docker is required — there is no inline mode. The container ensures the host machine identity is never visible:

- **Random hostname and MAC address** — network identity changes on every start
- **Bridge networking only** — no host network mode
- **All capabilities dropped** (`--cap-drop ALL`) and `no-new-privileges`
- **Named Docker volumes** — no host bind mounts that could leak paths
- **Config mounted read-only** — the container cannot modify its own config
- **`CHIMERA_PRIVACY_MODE=true`** — all providers run inline as processes (no Docker-in-Docker):
  - Anonymous node ID in logs and status
  - No orchestrator registration (no host IP/hostname exposed)
  - No device profiling (no CPU/RAM specs sent to external contracts)
  - Masks EVM addresses in log output
  - Disables P2P swarm

`init()` throws if Docker is not available. The `PrivacyContainer` class is exported for advanced use cases.

## Provider Testing

Test all providers after init:

```javascript
const results = await sdk.testProviders();
// { tested: 7, active: 5, results: [{ provider: 'golem', running: true, latency: 12 }, ...] }
```

## Inference API Keys

The hardened container exposes an **OpenAI-compatible** inference endpoint at `/v1/chat/completions`. You can create API keys that let other apps or users call inference without exposing the machine's identity.

### Creating a key

```javascript
const { key, id, keyPrefix } = await sdk.createInferenceKey({
  name: 'my-app-key',
  rateLimitRpm: 60,             // optional: 60 requests per minute
  modelAllowList: ['chimera-local'], // optional: restrict to specific models
});
// key = 'chim_<random-token>' — share this with the consumer app
// The key contains NO machine identity, NO personal info, NO embedded metadata
```

### Using the key for inference

The key works as a standard Bearer token with any OpenAI-compatible client:

```javascript
const res = await fetch('http://localhost:3002/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
  },
  body: JSON.stringify({
    model: 'chimera-local',
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
});
const data = await res.json();
```

Or using the SDK directly:

```javascript
const result = await sdk.infer({
  messages: [{ role: 'user', content: 'Hello!' }],
  apiKey: key,
});
```

### Managing keys

```javascript
await sdk.listInferenceKeys();      // list active keys (metadata only)
await sdk.revokeInferenceKey(id);   // revoke a key by ID
sdk.getInferenceEndpoint();         // get endpoint URL + usage info
```

### Paid inference access

Purchase temporary credits without sharing API keys:

```javascript
const access = await sdk.purchaseInferenceAccess({
  amountUSDT: 5.00,
  ttlSeconds: 3600,
  buyerAddress: '0x...',
});
// { token: 'chim_access_...', sessionId, credit, pricePerToken, expiresAt }

await sdk.getAccessPricing();              // current pricing
await sdk.getAccessStatus(sessionId);      // check session status
await sdk.revokeAccessSession(sessionId);  // revoke early
```

### Privacy guarantees

- API keys are **opaque random tokens** (`chim_` + 32 bytes) — no machine ID, hostname, IP, or user info embedded
- Keys are stored as **SHA-256 hashes** — the raw key is only returned once at creation time
- The inference endpoint returns only model output — **no host info, no device profile, no node ID**
- All requests are proxied through the hardened container — the host machine is never directly exposed

## Architecture

```
┌─────────────────┐
│  Your App       │  ← consent checkbox + start/stop buttons
│  (React, etc.)  │
└────────┬────────┘
         │ useChimera()
┌────────▼────────┐
│  Chimera SDK    │  ← manages consent, forwards EVM address
│  (@chimera/sdk) │    requires hardened container (Docker)
└────────┬────────┘
         │
┌────────▼────────┐
│  Privacy        │  ← Docker container: random hostname/MAC,
│  Container      │    bridge network, cap-drop ALL, no-new-privileges,
│  (Docker)       │    named volumes, CHIMERA_PRIVACY_MODE=true
└────────┬────────┘
         │
┌────────▼────────┐
│  Tasking        │  ← Golem, Mysterium, Anyone Protocol, BTFS, BTT AI,
│  Providers      │    Casper (relay) — all inline, no Docker-in-Docker
└────────┬────────┘
         │
┌────────▼────────┐
│  Protocol       │  ← monthly sweep → machine owner + app developer
│  Multisig       │    Privy wallets (EVM only)
└─────────────────┘
```

## Security: Private Key Handling

**The SDK never stores or exposes private keys.**

| Provider | Untrusted Hardware | Key Storage | SDK Access | App Can Steal? |
|----------|-------------------|-------------|------------|----------------|
| **Golem** | ✅ Safe | Yagna daemon manages keys inside container | Container API only | ❌ No |
| **Mysterium** | ✅ Safe | Node manages identity inside container | Container API only | ❌ No |
| **Anyone Protocol** | ✅ Safe | No keys required — relay uses EVM reward address | Container API only | ❌ No |
| **BTFS** | ✅ Safe | Walletless mode — unfunded daemon, no mnemonic | Container API only | ❌ No |
| **BTT AI** | ✅ Safe | No keys required — miner-cli runs inline | Container API only | ❌ No |
| **Casper** | ✅ Safe (relay mode) | Provider key lives on relay; worker never sees PEM | Relay URL + token only | ❌ No |

**Apps using the SDK cannot extract funds** because they never receive the actual key material — only references to OS-level secure storage.

**Removed from the codebase** — providers that require a private key, wallet mnemonic, account credentials, or self-managed config on the local machine are not included in Localchimera because they cannot safely run on untrusted hardware and their upstream protocols do not support a relay/worker split. The old list (BTT AI, Golem, Mysterium, Anyone Protocol, BTFS, CESS, Akash, Targon, ZCN, Income Generator, CashPilot, Salad, Heurist, Lium, Nosana, ByteLeap) and the per-network analysis is archived in `docs/RELAY_COMPATIBILITY.md` for reference.

## Full example

See `examples/basic-react/` for a complete working integration.

## License

MIT
