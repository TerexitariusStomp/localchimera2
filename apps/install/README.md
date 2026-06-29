# apps/install

Installers, build scripts, and startup helpers for Chimera apps.

## Installers

- `install.sh` — Cross-platform install script (Linux, macOS, Windows via WSL)
- `install-linux.sh` — Linux installer
- `install-macos.sh` — macOS installer
- `install-windows.ps1` — Windows PowerShell installer
- `windows-autostart.bat` — Windows autostart helper

## Build Scripts

- `build-macos.sh` — Build macOS DMG / app
- `build-windows.sh` — Build Windows MSI / installer

## Service / Startup Files

- `chimera.service` — systemd service for Linux
- `com.chimera.desktop.plist` — macOS LaunchAgent plist

## Specialized

- `README-qubes.md` — Qubes OS install notes
- `setup-brave-qubes.sh` — Brave browser setup on Qubes

See `../desktop/`, `../macos/`, and `../mobile*/` for the application source code.
