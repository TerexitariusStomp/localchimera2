# Production Readiness — Start Earning Now

## Current State

| Provider | Binary Built | SDK Integrated | Setup Script | Ready to Earn? |
|----------|-------------|----------------|-------------|----------------|
| **BTFS** | ✅ 141 MB | ✅ BtfsProvider.js | ✅ setup-btfs.sh | ⚠️ Needs wallet + BTT |
| **0Chain Blobber** | ✅ 57 MB | ✅ ZcnProvider.js | ✅ setup-zcn-blobber.sh | ⚠️ Needs wallet + ZCN stake |
| **Akash** | CLI installed | ✅ AkashProvider.js | N/A | ⚠️ Needs AKT funding |
| **Targon** | ✅ targon-cli | ✅ TargonProvider.js | N/A | ⚠️ Needs 1000 TAO stake |

---

## Step-by-Step: Get Each Provider Earning

### 1. BTFS — Earn BTT (BitTorrent Token)

**What you need:**
- BTT tokens in a TRON-compatible wallet
- Port 4001/TCP forwarded for P2P
- Some disk space to offer (50 GB minimum)

**Setup:**
```bash
cd /home/user/CascadeProjects/qvac-chimera
./providers/setup-btfs.sh
```

This creates:
- `~/.btfs/` — BTFS repository
- `~/btfs-storage/` — storage directory
- `~/.config/systemd/user/btfs.service` — auto-start service

**Fund your wallet:**
1. Install TronLink wallet (browser extension)
2. Buy BTT on an exchange (e.g., Binance, Kraken)
3. Withdraw BTT to your TronLink address
4. Import that wallet into BTFS UI at http://127.0.0.1:5001/hostui

**Start earning:**
```bash
systemctl --user enable --now btfs
# or manually:
BTFS_PATH=$HOME/.btfs ./upstream/btfs/btfs daemon --enable-storage-host
```

**How earnings work:**
- **Storage rent**: Renters pay BTT to store files on your node
- **Airdrops**: Daily BTT rewards simply for being online with storage offered

---

### 2. 0Chain Blobber — Earn ZCN (Züs Network)

**What you need:**
- ZCN tokens + ETH (for gas) in a wallet
- ZCN stake locked on your blobber
- Public IP or domain (optional but recommended)

**Setup:**
```bash
cd /home/user/CascadeProjects/qvac-chimera
./providers/setup-zcn-blobber.sh
```

This creates:
- `~/.zcn/` — blobber config, keys, data
- `~/.config/systemd/user/zcn-blobber.service` — auto-start service

**Create wallet & fund:**
```bash
# Install 0Chain CLI tools
go install github.com/0chain/zwalletcli@latest
go install github.com/0chain/zboxcli@latest

# Create wallet
zwalletcli createwallet --wallet mywallet.json
# Save the client_id from output

# Send ZCN + ETH to this wallet
# Then deposit ZCN to Bolt: https://bolt.holdings/
```

**Configure blobber:**
```bash
# Edit both config files
nano ~/.zcn/config/0chain_blobber.yaml
nano ~/.zcn/config/0chain_validator.yaml

# Set delegate_wallet to your client_id
# Set read_price / write_price (competitive rates)
```

**Stake and start:**
```bash
# Lock stake on your blobber
zbox sp-lock --blobber_id <your_blobber_id> --tokens 0.5

# Start the node
systemctl --user enable --now zcn-blobber
```

**How earnings work:**
- **Storage rent**: Users pay ZCN based on read_price × GB read, write_price × GB written
- **Staking rewards**: Share of block rewards proportional to your stake
- **Quality score**: Higher score = more user allocations = more earnings

---

### 3. Akash Provider — Earn AKT

**What you need:**
- AKT tokens in your `mykey` wallet
- On-chain provider registration
- k3s cluster running

**Check status:**
```bash
provider-services keys show mykey
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl get nodes
```

**Fund and register:**
```bash
# Send AKT to your address (shown by keys show above)
# Then register as a provider
provider-services tx provider create-provider \
  --from mykey \
  --node https://rpc.akashnet.net:443
```

**Start earning:**
```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
provider-services run --from mykey --node https://rpc.akashnet.net:443
```

---

### 4. Targon — Earn TAO (Bittensor)

**What you need:**
- 1000 TAO minimum stake
- Hotkey registered on Targon subnet

**Check status:**
```bash
cat ~/.config/.targon.json
# Should show your hotkey_phrase (stored securely)
```

**Register and stake:**
```bash
# Use btcli or targon-wallet-cli
btcli subnet register --netuid <targon_subnet_id> --wallet.name chimera
btcli stake add --amount 1000 --netuid <targon_subnet_id>
```

**Start earning:**
```bash
cd /home/user/CascadeProjects/qvac-chimera/upstream/targon
./targon-cli
```

---

## Quick Start (One Command)

After all wallets are funded:

```bash
cd /home/user/CascadeProjects/qvac-chimera
./providers/start-all.sh
```

This starts:
1. Salad worker (if binary exists)
2. Targon CPU provider
3. BTFS storage node
4. 0Chain blobber

Then check status with:
```bash
# View all running PIDs
cat providers/logs/*.pid 2>/dev/null

# View logs
tail -f providers/logs/btfs.log
tail -f providers/logs/zcn-blobber.log
```

---

## SDK Auto-Start in Apps

When an app uses the Chimera SDK, it will auto-detect and start all configured providers:

```javascript
const sdk = new ChimeraSDK({
  appName: 'MyApp',
  appDeveloperEVM: '0xYourPayoutAddress',
  revenueSplit: { machineOwner: 0.70, appDeveloper: 0.30 }
});

await sdk.init();      // Auto-detects BTFS, ZCN, Akash, Targon binaries
await sdk.giveConsent();
await sdk.start();     // Starts ALL viable providers

const status = sdk.status();
console.log(status.externalProviders);
// [
//   { provider: 'btfs', running: true, pid: 12345, storageMax: '100GB' },
//   { provider: 'zcn', running: true, pid: 12346, port: 5050 },
//   { provider: 'akash', running: true, pid: 12347, keyName: 'mykey' },
//   { provider: 'targon', running: true, pid: 12348, nodeType: 'CPU' }
// ]
```

---

## What You Need to Fund (Summary)

| Provider | Token | Minimum | Where to Buy |
|----------|-------|---------|-------------|
| **BTFS** | BTT | ~1 BTT (for gas) | Binance, Kraken, KuCoin |
| **0Chain** | ZCN + ETH | 0.5 ZCN for stake | Uniswap, Bolt wallet |
| **Akash** | AKT | Provider deposit (~50 AKT) | Binance, Kraken, Osmosis |
| **Targon** | TAO | 1000 TAO | Binance, Kraken, Bittensor subnet |

**Important**: The Chimera SDK and these scripts never store your private keys. Keys are kept in:
- BTFS: TRON wallet (TronLink, user-managed)
- 0Chain: `zwalletcli` wallet files (user-managed)
- Akash: `provider-services` OS keyring
- Targon: `~/.config/.targon.json` (user-owned, 0600)
