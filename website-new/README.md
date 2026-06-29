# website/

Static marketing site for Chimera. Deployed to Cloudflare Pages at https://localchimera.com

## Files

- **index.html** — Landing page with features, download links, and navigation
- **demo-wiki.html** — Read-only interactive demo of the LLM Wiki layout. Shows the full app UI (sidebar, editor, preview, AI Writer panel) without editing capability
- **earnings.html** — Earnings dashboard where developers and miners enter their EVM address to view payout history
- **console.html** — Cloud console-style dashboard home (sidebar, welcome cards, account stats, empty state)
- **deployments.html** — List of active, pending, and closed deployments with filters and redeploy links
- **rental.html** — Dark-themed rental creation flow with templates, GPU/CPU configs, storage, and SSH keys
- **deploy.html** — Create deployment page with SDL builder/YAML editor and Docker Hub image search
- **templates.html** — Marketplace of pre-built AI/ML and container templates
- **providers.html** — Network capacity map, provider stats, and audited provider list
- **chimeralogo.png** — Logo with background (for favicon)
- **chimeralogo-header.png** — Logo without background (for header)
- **banner2.png** — Hero banner image

## Local development

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

The **Deploy** page searches Docker Hub for public images. Because Docker Hub's search API does not send CORS headers, the browser tries the API directly first, then falls back to a public CORS proxy for local/development origins. For a production deployment you will want to replace the proxy with your own backend endpoint.
