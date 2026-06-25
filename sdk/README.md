# Chimera SDK

Integrate local AI mining into your application. Your users earn revenue from idle inference tasks. You earn a percentage as the app integrator.

## How payouts work

All mining rewards flow through **Chimera protocol multisigs** — you never need a Bittensor, Solana, or Nostr wallet.

1. **Mining** — user's device completes tasks on:
   - **Untrusted-hardware-safe**: Chutes, Routstr, BTT AI, Golem, Anyone Protocol, Mysterium, Casper (relay mode)
   - **Self-managed** (local keys required): BTFS, ZCN
2. **Weekly sweep** — all funds are swept into the Chimera EVM collection multisig
3. **Monthly distribution** — funds are split and sent to:
   - **Machine owner** EVM address (set on the Chimera landing page)
   - **App developer** EVM address (your address, set in SDK options)

Apps only need to pass an **EVM address** — nothing else.

## What the SDK gives your app

- **Consent prompt** — users opt in before any mining starts
- **Start / Stop controls** — one-click mining controls
- **Miner status** — real-time view of which miners are active

Wallet setup, earnings tracking, and revenue distribution are handled on the **Chimera landing page**, not in your app.

## Install

```bash
npm install @chimera/sdk
```

Or copy the `sdk/` folder into your project.

## Quick Start

### React — drop-in component

```jsx
import { useChimera } from '@chimera/sdk/src/useChimera.js';

function MiningPanel() {
  const { status, consentGiven, giveConsent, revokeConsent, start, stop } = useChimera({
    appDeveloperEVM: '0xYourEvmWalletAddressHere' // your payout address
  });

  return (
    <div>
      {!consentGiven && (
        <div>
          <p>Enable AI mining to earn revenue from inference tasks while your device is idle.</p>
          <button onClick={giveConsent}>I agree — enable mining</button>
        </div>
      )}

      {consentGiven && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={start} disabled={status.running}>▶ Start</button>
          <button onClick={stop} disabled={!status.running}>⏹ Stop</button>
          <button onClick={revokeConsent}>Revoke</button>
        </div>
      )}
    </div>
  );
}
```

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
| Configure per-chain addresses (Bittensor, Solana, Nostr) | Pass only `appDeveloperEVM` |
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
| `configPath` | string | `./config.json` | Path to QVAC config |

## Architecture

```
┌─────────────────┐
│  Your App       │  ← consent checkbox + start/stop buttons
│  (React, etc.)  │
└────────┬────────┘
         │ useChimera()
┌────────▼────────┐
│  Chimera SDK    │  ← manages consent, forwards EVM address
│  (@chimera/sdk) │
└────────┬────────┘
         │
┌────────▼────────┐
│  Chimera Node   │  ← QVAC inference, miners, protocol multisigs
│  (localhost)    │
└────────┬────────┘
         │
┌────────▼────────┐
│  External       │  ← BTT AI (GPU tasking), Golem (compute), Anyone Protocol,
│  Providers      │    Mysterium (VPN), Casper (relay), BTFS, ZCN (self-managed; local keys required)
└────────┬────────┘
         │
┌────────▼────────┐
│  Protocol       │  ← weekly sweep → EVM collection multisig
│  Multisigs      │  ← monthly split → machine owner + app developer
└─────────────────┘
```

## Security: Private Key Handling

**The SDK never stores or exposes private keys.**

| Provider | Untrusted Hardware | Key Storage | SDK Access | App Can Steal? |
|----------|-------------------|-------------|------------|----------------|
| **Chutes** | ✅ Safe | Relay holds hotkey | Worker reports endpoint only | ❌ No |
| **Routstr** | ✅ Safe | No keys required | Nostr nsec reference only | ❌ No |
| **BTT AI** | ✅ Safe (proxy mode) | Relay holds wallet | Worker reports endpoint only | ❌ No |
| **Golem** | ✅ Safe | Payout address only; node identity inside container | Wallet address reference only | ❌ No |
| **Anyone Protocol** | ✅ Safe | No keys required | Container name reference only | ❌ No |
| **Mysterium** | ✅ Safe | No keys required | Container name reference only | ❌ No |
| **Casper** | ✅ Safe (relay mode) | Provider key lives on relay; worker never sees PEM | Relay URL + token only | ❌ No |
| **BTFS** | ❌ Self-managed | `~/.btfs` (user-managed) | Binary path only | ❌ No |
| **ZCN** | ❌ Self-managed | `~/.zcn` (user-managed) | Config path only | ❌ No |

**Removed from SDK** (incompatible with untrusted hardware): Akash, Targon, CESS, Income Generator, CashPilot, Salad, Heurist, Lium, Nosana, ByteLeap.

**Apps using the SDK cannot extract funds** because they never receive the actual key material — only references to OS-level secure storage.

**Self-managed providers** require local wallet setup (mnemonics, config files, or PEM keys stored on the machine). They will not function on untrusted hardware unless the machine owner has already configured the wallet.

## Full example

See `examples/basic-react/` for a complete working integration.

## License

MIT
