# website/

Static marketing site and React console source for Chimera. The deployed site is built from `../website-new/`.

## Files

- **index.html** — Landing page with features, download links, and navigation
- **demo-wiki.html** — Read-only interactive demo of the LLM Wiki layout
- **inference-frontend/** — React console app source (built and copied to `../website-new/console/`)
- **chimeralogo.png** — Logo with background (for favicon)
- **chimeralogo-header.png** — Logo without background (for header)
- **banner2.png** — Hero banner image

## Local development

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```
