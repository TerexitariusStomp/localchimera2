# Relay Compatibility Analysis (Archived)

> **Status**: The networks listed below have been **removed from the Localchimera codebase** because they cannot run safely on untrusted hardware and their upstream protocols do not support a relay/worker split. This document is kept as an archive of the analysis.

Localchimera only integrates providers that can run on **untrusted hardware** — machines where the app developer or end-user should not be able to extract funds or impersonate the provider. The safe pattern is a **relay/worker split**:

- **Relay** (trusted, owner-controlled) holds the private key, wallet, or account credentials.
- **Worker** (untrusted, SDK-controlled) runs the actual resource (inference, bandwidth, compute) and talks to the relay.

This document explains why the removed networks **cannot** use this relay pattern and therefore are not included in Localchimera.

---

## Why a relay pattern is possible for SDK-safe providers

| Provider | Relay holds | Worker does | Upstream protocol supports the split |
|---|---|---|---|
| **Chutes** | Hotkey, registration, payments | Runs vLLM/SGLang inference endpoint | ✅ Yes — chutesd proxy design |
| **Routstr** | No keys needed (Nostr nsec optional, Cashu wallet) | Serves inference via OpenAI-compatible API | ✅ Yes — NIP-60 / Cashu design |
| **BTT AI** | Wallet, miner registration | Runs inference container | ✅ Yes — proxy/miner split |
| **Golem** | Payout address only; node identity inside container | Runs yagna provider container | ✅ Yes — Docker-based, no external key needed |
| **Anyone Protocol** | No keys | Runs onion-routing relay | ✅ Yes — relay requires no wallet |
| **Mysterium** | No keys | Runs VPN node | ✅ Yes — node requires no wallet |
| **Casper** | Provider PEM key on relay | Worker executes unsigned payloads, relay signs | ✅ Yes — relay mode explicitly designed |
| **Earnidle** | Public Solana address only (no private key) | Runs inference, submits results | ✅ Yes — public address + API signature |

---

## Why a relay pattern does NOT work for the removed networks

The removed networks are **monolithic** by design: the same process that provides the resource must also hold the authentication key or credentials. There is no supported, protocol-native way to separate authentication from execution.

| Network | What the local process needs | Why a relay can't fix it |
|---|---|---|
| **Cortensor** | `cortensord` generates a local key pair, registers the node, and signs Proof-of-Useful-Work responses. | The upstream binary is a single daemon; registration, key storage, and work signing are all internal. A relay would have to reimplement or proxy-sign the protocol, which is not supported by Cortensor. |
| **Fortytwo** | `~/.fortytwo/identity.json` contains `node_id` and `secret_key`; the node uses the secret key to poll and authenticate with the Fortytwo API. | The API expects the secret key from the node that actually runs the inference. A relay could hold the key, but the upstream protocol does not define a relay/worker role; it would require custom proxy re-signing of every poll. |
| **CESS** | `cess-nodeadm` creates and manages a local CESS blockchain account/wallet; the node signs storage proofs and on-chain transactions. | The CESS node is a blockchain participant. Signing must happen at the node, close to the stored data, and upstream does not expose a "relay signs for worker" API. |
| **Akash** | `provider-services` needs a keyring-named key and a `KUBECONFIG` to bid on and lease deployments. | The provider daemon signs lease bids in real time. A relay holding the key would need to sign every bid and transaction on behalf of the provider, which is not a supported Akash provider architecture. |
| **Targon** | `targon-cli` reads `~/.config/.targon.json` with the miner's hotkey and signs responses for the Bittensor subnet. | Bittensor miners sign responses with their hotkey. A relay could theoretically sign, but Targon's miner is not designed to delegate execution; the hotkey is expected to be local to the inference process. |
| **ZCN / 0Chain** | Blobber stores data and signs challenge responses using `~/.zcn` wallet config. | The blobber is both storage and signer; upstream does not separate data hosting from challenge signing. |
| **BTFS** | The BTFS daemon manages a local wallet in `~/.btfs` and uses it for storage contracts and rewards. | BTFS is a self-contained IPFS-like node with an embedded wallet; there is no relay API for signing. |
| **Income Generator** | `docker compose` runs multiple bandwidth apps (Honeygain, PacketStream, etc.), each with its own signup credentials. | Each upstream app is a closed-source daemon that expects its own credentials locally. A relay would need to proxy many unrelated credential systems, none of which expose a relay API. |
| **CashPilot** | DePIN manager worker container stores credentials for multiple services and signs into their APIs. | CashPilot is designed as a self-hosted credential manager; its worker expects direct access to service credentials. No upstream relay API exists. |
| **Salad** | Salad job-queue worker authenticates with a Salad account to pull and run jobs. | Salad's worker protocol authenticates the node directly; a relay cannot pull jobs on behalf of an untrusted worker without exposing credentials. |
| **Heurist** | `miner-release` stores an identity wallet locally and signs miner authentication / reward claims. | The Heurist miner is a single process that runs inference and signs with its identity wallet. Upstream does not support a relay/worker split. |
| **Lium** | GPU provider uses a Bittensor wallet or API key to register and accept jobs. | The Lium protocol expects the provider to be the authenticated party; there is no supported delegation of authentication to a relay. |
| **Nosana** | `nosana-kit` / node uses a Solana wallet to interact with the Nosana programs. | The Nosana node is a Solana signer and compute host; upstream does not separate signing from execution. |
| **ByteLeap** | Bittensor miner on SN128 uses a wallet to register and submit work. | Like Targon, the miner is a monolithic Bittensor process; the hotkey is expected to be local to the worker. |

---

## General rule

A network can only be added to `@chimera/sdk` if **at least one** of these is true:

1. The upstream protocol natively supports a relay/worker split (e.g., Chutes, BTT AI, Casper relay).
2. The node requires **no** private key or credentials (e.g., Golem, Anyone Protocol, Mysterium).
3. The node only needs a **public** identifier or payout address (e.g., Earnidle).

If the upstream protocol is monolithic and the key must live on the same machine that provides the resource, the network is **not included in Localchimera** and is never exposed to the SDK.

---

## If upstream adds relay support later

When a removed network releases an official relay/worker architecture:

1. Fork the new upstream repo into `upstream/`.
2. Add a thin SDK provider wrapper in `sdk/src/miners/` that talks to the relay, not the wallet.
3. Update this doc and `docs/UPSTREAM.md` to move the network to the SDK-safe list.
4. Until then, the network remains **node-only**.
