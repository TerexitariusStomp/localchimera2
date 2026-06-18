#!/bin/bash
# Chimera Cross-Platform Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/TerexitariusStomp/qvac-chimera/main/install.sh | bash

set -e

REPO="TerexitariusStomp/qvac-chimera"
API="https://api.github.com/repos/$REPO/releases/latest"
OS=$(uname -s)
ARCH=$(uname -m)

echo "=== Chimera Installer ==="
echo "OS: $OS, Arch: $ARCH"
echo ""

case "$OS" in
  Linux)
    if command -v dpkg >/dev/null 2>&1; then
      echo "Detected Debian/Ubuntu. Using .deb installer..."
      curl -fsSL "https://raw.githubusercontent.com/$REPO/main/install-linux.sh" | bash
    elif command -v rpm >/dev/null 2>&1; then
      echo "Detected Red Hat/Fedora. Downloading RPM..."
      ASSET_URL=$(curl -s "$API" | grep "browser_download_url" | grep "\.rpm" | head -1 | cut -d '"' -f 4)
      if [ -n "$ASSET_URL" ]; then
        curl -L -o /tmp/chimera.rpm "$ASSET_URL"
        sudo rpm -i /tmp/chimera.rpm
        echo "Starting Chimera..."
        chimera
      else
        echo "No RPM found. Trying binary fallback..."
        curl -fsSL "https://raw.githubusercontent.com/$REPO/main/install-linux.sh" | bash
      fi
    else
      curl -fsSL "https://raw.githubusercontent.com/$REPO/main/install-linux.sh" | bash
    fi
    ;;

  Darwin)
    echo "Detected macOS. Running macOS installer..."
    curl -fsSL "https://raw.githubusercontent.com/$REPO/main/install-macos.sh" | bash
    ;;

  CYGWIN*|MINGW*|MSYS*)
    echo "Detected Windows. Please run the PowerShell installer:"
    echo "  irm https://raw.githubusercontent.com/$REPO/main/install-windows.ps1 | iex"
    exit 1
    ;;

  *)
    echo "Unsupported OS: $OS"
    echo "Please download manually from: https://github.com/$REPO/releases"
    exit 1
    ;;
esac
