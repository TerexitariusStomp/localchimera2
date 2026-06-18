# macOS App

The macOS app is built from the same Tauri source as `apps/desktop/`.

## Build

```bash
cd apps/desktop
npm install
npm run tauri:build -- --target universal-apple-darwin
# Output: src-tauri/target/release/bundle/dmg/
```

## Planned

- [ ] Universal binary (Intel + Apple Silicon)
- [ ] DMG installer with drag-to-Applications
- [ ] Notarization for Gatekeeper
- [ ] Mac App Store submission
