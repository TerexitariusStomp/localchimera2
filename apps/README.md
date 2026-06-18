# apps/

OS-specific applications that wrap the Chimera LLM Wiki and backend.

## desktop/

Tauri-based desktop app for Linux, macOS, and Windows. Bundles the React frontend inside a native Rust shell with a Go supervisor sidecar for node lifecycle management.

- **src/** — React frontend (copied from qvac/frontend/dist at build time)
- **src-tauri/** — Rust Tauri shell, Cargo.toml, tauri.conf.json
- **src-tauri/icons/** — App icons for all platforms (PNG, ICO, ICNS)
- **supervisor/** — Go binary that manages Docker container start/stop
- **dist/** — Build output copied from qvac/frontend

Build:
```bash
cd apps/desktop
npm install
npm run tauri:build
# Output: src-tauri/target/release/bundle/
```

## install/

One-click install scripts for setting up Chimera on each platform.

- **install-linux.sh** — Installs Docker, pulls image, starts node
- **install-macos.sh** — macOS setup with Homebrew dependencies
- **install.sh** — Universal installer that detects OS

## macos/ (planned)

Native macOS app bundle (.app) and DMG installer. Built from the same Tauri source as desktop/.

## mobile/ (planned)

Capacitor-wrapped mobile apps for iOS and Android. Each phone is a standalone node — no relay, no desktop dependency.

- **ios/** — Xcode project for App Store
- **android/** — Android Studio project for Play Store

Build:
```bash
cd qvac/frontend
npm install && npm run build
npx cap sync
npx cap open ios     # Xcode → Archive → App Store
npx cap open android # Android Studio → Generate Signed Bundle
```
