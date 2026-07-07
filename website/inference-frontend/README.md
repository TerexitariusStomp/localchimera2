# website/inference-frontend

React frontend for the Chimera encrypted inference marketplace.

## Development

```bash
cd website/inference-frontend
npm install
npm run dev
```

## Build

```bash
npm run build
```

The build output is served from `website/inference/`.

## Domain Registrar

The static `website-new/` pages (including `console.html` and `domains.html`) are copied into `dist/` during the post-build step. The domain registrar API is implemented as Cloudflare Pages Functions in `functions/` and uses the `DOMAIN_KV` namespace for order/contact persistence.

### Setup before first deploy

1. Create the KV namespace:
   ```bash
   wrangler kv:namespace create "DOMAIN_KV"
   ```
   Copy the returned `id` into `wrangler.toml` under `[[kv_namespaces]]`.

2. Add the NameSilo API key as a secret:
   ```bash
   wrangler pages secret put NAMESILO_KEY
   ```

### Deploy

```bash
npm run build
wrangler pages deploy ./dist
```

## Related

- `../../inference-backend/` — Inference backend API
- `../../inference-README.md` — High-level inference documentation
- `../../contracts/FHEInferenceMarket.sol` — On-chain FHE market contract
