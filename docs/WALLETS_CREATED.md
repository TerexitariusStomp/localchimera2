# Wallets Created

> ⚠️ **ARCHIVED**: The networks listed below (Akash, Targon, Nosana, Lium, Heurist, ByteLeap) have been removed from the Localchimera codebase because they require a private key, wallet, or credentials on the local machine and cannot safely run on untrusted hardware. This document is kept only as a personal record of previously created wallets.
>
> ⚠️ **SECURITY NOTICE**: Mnemonic phrases are stored ONLY in OS-level secure
> storage (provider-services keyring, `~/.config/.targon.json`). They are NOT
> included in this repository. This document lists wallet names and public
> addresses only.

## 1. Akash Wallet

**Command used**:
```bash
provider-services keys add mykey
```

**Output**:
```
- name: mykey
  type: local
  address: AKASH_ADDRESS_REDACTED
  pubkey: '{"@type":"/cosmos.crypto.secp256k1.PubKey","key":"..."}'
```

**Mnemonic location**: `provider-services` OS keyring (not in repo).

**⚠️ IMPORTANT**: Write this mnemonic phrase in a safe place. It is the only way
to recover your account if you ever forget your password.

**Next step**: This wallet needs AKT tokens for the provider deposit. Once
funded, run:
```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
provider-services run --from mykey --node https://rpc.akashnet.net:443
```

---

## 2. Targon Wallet

**Method**: Valid BIP39 mnemonic (24 words) generated via the `mnemonic` Python
library.

**Stored at**: `~/.config/.targon.json` (user-owned, mode 0600)

**Config format**:
```json
{
  "hotkey_phrase": "<REDACTED — see ~/.config/.targon.json>",
  "ip": "127.0.0.1",
  "port": 7777,
  "min_stake": 1000
}
```

**Verification**: The `targon-cli` miner binary now initializes successfully and
starts the HTTP server on port 7777.

**Next step**: This wallet needs on-chain registration with 1000 TAO minimum
stake. The `targon-wallet-cli` is built from source at:
```bash
cd /home/user/CascadeProjects/qvac-chimera/upstream/targon/targon
go build -o ../targon-wallet-cli ./cmd/targon-cli
```

**CPU mode command**:
```bash
cd /home/user/CascadeProjects/qvac-chimera/upstream/targon
./targon-cli
```

---

## Existing Wallets (Previously Found)

### Solana / Nosana
- **Path**: `~/.nosana/nosana_key.json`
- **Address**: `NOSANA_ADDRESS_REDACTED`
- **Needs**: SOL for gas + NOS stake (~168 NOS for CPU)

### Bittensor / Lium
- **Path**: `~/.bittensor/wallets/chimera/`
- **ss58Address**: `BITTENSOR_ADDRESS_REDACTED`
- **Hotkey**: `default`
- **Needs**: TAO for subnet 51 registration

---

## Summary Table

| Network | Wallet | Address | Status |
|---------|--------|---------|--------|
| **Akash** | `mykey` | `AKASH_ADDRESS_REDACTED` | ✅ Created, needs AKT |
| **Targon** | BIP39 mnemonic | derived from `~/.config/.targon.json` | ✅ Created, needs 1000 TAO stake |
| **Nosana** | `~/.nosana/nosana_key.json` | `NOSANA_ADDRESS_REDACTED` | ✅ Existing, needs SOL + NOS |
| **Lium** | `~/.bittensor/wallets/chimera/` | `BITTENSOR_ADDRESS_REDACTED` | ✅ Existing, needs TAO |
| **Heurist** | — | — | ❌ Not created (CPU blocked) |
| **ByteLeap** | — | — | ❌ Not created (CPU blocked) |

---

## What You Need to Fund

1. **Akash**: Send AKT to `AKASH_ADDRESS_REDACTED`
2. **Targon**: Register hotkey on-chain with 1000 TAO stake
3. **Nosana**: Send SOL + NOS to `NOSANA_ADDRESS_REDACTED`
4. **Lium**: Register on Bittensor subnet 51 with TAO

---

## Files Updated

- `~/.config/.targon.json` — Targon hotkey config (user home, not in repo)
- `docs/WALLETS_CREATED.md` — this file
