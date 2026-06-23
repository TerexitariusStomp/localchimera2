# Wallets Created

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
  pubkey: '{"@type":"/cosmos.crypto.secp256k1.PubKey","key":"AikUUaUhoRBErKjJF1pSIfzAdXdAE0KGfVGELRE2Ai4o"}'
```

**Mnemonic (SAVE THIS)**:
```
AKASH_MNEMONIC_REDACTED
```

**⚠️ IMPORTANT**: Write this mnemonic phrase in a safe place. It is the only way to recover your account if you ever forget your password.

**Next step**: This wallet needs AKT tokens for the provider deposit. Once funded, run:
```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
provider-services run --from mykey --node https://rpc.akashnet.net:443
```

---

## 2. Targon Wallet

**Method**: Generated a valid BIP39 mnemonic (24 words) using the `mnemonic` Python library.

**Mnemonic (SAVE THIS)**:
```
TARGON_MNEMONIC_REDACTED
```

**Saved to**:
- `~/.config/.targon.json` (targon-wallet-cli global config)
- `~/CascadeProjects/qvac-chimera/upstream/targon/config.json` (local miner config)

**Config contents**:
```json
{
  "hotkey_phrase": "TARGON_MNEMONIC_REDACTED",
  "ip": "127.0.0.1",
  "port": 7777,
  "min_stake": 1000
}
```

**Verification**: The `targon-cli` miner binary now initializes successfully and starts the HTTP server on port 7777 (was previously failing with "Invalid mnemonic").

**Next step**: This wallet needs on-chain registration with 1000 TAO minimum stake. The `targon-wallet-cli` is built from source at:
```bash
cd /home/user/CascadeProjects/qvac-chimera/upstream/targon/targon
go build -o ../targon-wallet-cli ./cmd/targon-cli
```

**CPU mode command**:
```bash
cd /home/user/CascadeProjects/qvac-chimera/upstream/targon
./targon-cli
```

**Note**: The `tvm/install` binary is a pre-compiled attestation tool that still reports "hotkey phrase not passed". This appears to read the hotkey from a different mechanism (possibly stdin or an undocumented env var). The miner binary (`targon-cli`) works correctly with the config file.

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
| **Targon** | 24-word mnemonic | derived from BIP39 | ✅ Created, needs 1000 TAO stake |
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

- `~/.config/.targon.json` — Targon hotkey config
- `upstream/targon/config.json` — Targon miner local config
- `docs/WALLETS_CREATED.md` — this file
