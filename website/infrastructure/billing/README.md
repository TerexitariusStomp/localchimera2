# Chimera billing

The billing page is a resource marketplace on the static Cloudflare Pages site. Users pay for tasking resources (Golem compute, BTFS storage, etc.) via Web3Auth + Request Network; the protocol converts payments to the resource's native token off-chain.

## Architecture

- **Frontend**: Cloudflare Pages (static React app in `website/inference-frontend/`).
- **Payments**: Request Network SDK loaded from unpkg CDN. Payer-signed requests are created with the protocol address as payee.
- **Orders**: Cloudflare Functions record paid orders in KV (`/api/billing/order-resource`, `/api/billing/orders`).
- **Conversion**: A backend worker (outside the static site) converts received ETH/stablecoins to the resource's native token and provisions the resource.
- **Referrals**: RefRef is tracked as upstream; deploy it on a managed container or replace it with a Cloudflare D1 + Workers tracker.

## Request Network integration

- The Request Network SDK is loaded dynamically from unpkg (no npm install needed).
- The user connects an EVM wallet via Web3Auth.
- The frontend creates a payer-signed request with the protocol address as payee.
- The user pays the request directly from the app.
- The order is recorded in KV for the backend conversion worker.

## Set up

1. Set `VITE_PROTOCOL_ADDRESS` in `website/inference-frontend/.env.production` to the protocol EVM address.
2. Connect an EVM wallet via the Web3Auth button in the header.
3. On the Billing page, select a resource, enter quantity, and pay.

## Referrals

RefRef is tracked as an upstream submodule in `website/inference-frontend/third-party/refref`.

## Frontend configuration

```env
VITE_API_BASE=https://api.localchimera.com
VITE_PROTOCOL_ADDRESS=0x...
```

Then rebuild and deploy:

```bash
cd website/inference-frontend
npm run build
npx wrangler pages deploy dist
```
