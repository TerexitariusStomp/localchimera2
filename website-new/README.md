# website-new/

Static marketing site + React console + VitePress docs for Chimera. Deployed to Cloudflare Pages at https://new.localchimera.com

- The console is built from `../website/inference-frontend/` and copied to `console/` during deployment.
- Documentation is built from `docs/` with VitePress (`upstream/vitepress` git submodule) and served at `/docs/`.
- Cloudflare Pages Functions in `functions/` power API endpoints.

## Files

- **index.html** — Landing page with features, download links, and navigation
- **console/** — Built React console app (served at `/console/`)
- **docs/** — VitePress documentation source (served at `/docs/`)
- **demo-wiki.html** — Read-only interactive demo of the LLM Wiki layout
- **example/** — Browser node example UI with global provider map
- **chimeralogo.png** — Logo with background (for favicon)
- **chimeralogo-header.png** — Logo without background (for header)
- **banner2.png** — Hero banner image

## Local development

```bash
npm install
npm run build-docs
python3 -m http.server 8080
# Open http://localhost:8080
```

## Cloudflare Pages deployment

1. Install Wrangler and log in:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Deploy:
   ```bash
   npm run deploy
   # or
   wrangler pages deploy .
   ```

3. Local preview with Functions:
   ```bash
   npm run dev
   ```
