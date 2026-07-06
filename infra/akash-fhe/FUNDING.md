# Akash CLI Wallet Funding Guide

The CLI deployment script (`deploy-cli.sh`) uses a self-custody AKT wallet. You must fund it yourself; the script will print the wallet address so you know where to send AKT.

## Quick steps

1. **Install the Akash CLI** (one-time)
   ```bash
   curl -sL https://github.com/akash-network/node/releases/latest | grep -o 'href="/akash-network/node/releases/download/[^"]*_linux_amd64.tar.gz"' | head -n1 | sed 's/href="/https://github.com/' | xargs curl -sL -o akash.tar.gz
   tar -xzf akash.tar.gz -C /usr/local/bin/ akash
   akash version
   ```
   Or use the official install docs: https://docs.akash.network/guides/cli

2. **Create or import a wallet**
   ```bash
   export AKASH_KEY_NAME=fhe-deploy
   akash keys add $AKASH_KEY_NAME              # creates a new wallet (save the mnemonic!)
   # or
   akash keys add $AKASH_KEY_NAME --recover    # restore from a seed phrase
   ```

3. **Get the wallet address**
   ```bash
   akash keys show $AKASH_KEY_NAME -a
   ```

4. **Fund the wallet with AKT**

   You need a small amount of AKT (e.g., $5–$20 worth is plenty for a short test). Options:

   - **CEX withdrawal**: Withdraw AKT from a centralized exchange (e.g., Crypto.com, Gate.io, Kraken) to the wallet address from step 3. Make sure to select the **Akash Network (akashnet-2)** chain, not ERC-20 or other networks.
   - **Osmosis / DEX**: Swap to AKT on Osmosis (osmosis.zone) and withdraw to the Akash Network address from step 3.
   - **Bridge**: If you have USDC or other assets, use a bridge that supports Akash Network.

5. **Verify the balance**
   ```bash
   export AKASH_NODE=https://rpc.akashnet.net:443
   akash query bank balances $(akash keys show $AKASH_KEY_NAME -a) --node $AKASH_NODE
   ```

6. **Deploy**
   ```bash
   cd infra/akash-fhe
   export AKASH_KEY_NAME=fhe-deploy
   export FHE_TIER=fhe-rtx4090
   export GHCR_TOKEN=              # leave empty if the image is public, or set for private pulls
   ./deploy-cli.sh
   ```

## Expected costs

- The GPU tiers (RTX 4090, A100, H100) cost provider-specific bids, typically a few cents to a few dollars per hour.
- You also pay tiny on-chain gas fees (usually less than 0.1 AKT total for create + lease + manifest).
- The CLI has no Console-imposed minimum deposit, so you can deploy with just enough AKT for a short test.

## Troubleshooting

- **No bids**: GPU providers may be full or your pricing is too low. Try a different tier or increase the `amount` in `deploy.yml` for that tier.
- **Out of gas**: Increase `AKASH_GAS_ADJUSTMENT` (e.g., `2.0`) before running the script.
- **Wrong chain**: Ensure `AKASH_CHAIN_ID` is set to `akashnet-2` and `AKASH_NODE` points to a healthy Akash RPC.
