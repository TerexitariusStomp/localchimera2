#!/bin/bash
# Chimera macOS Installer — one-click install & run
set -e

REPO="TerexitariusStomp/qvac-chimera"
API="https://api.github.com/repos/$REPO/releases/latest"

echo "=== Chimera Installer for macOS ==="
echo "Fetching latest release..."

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  ASSET_PATTERN="arm64"
else
  ASSET_PATTERN="x86_64"
fi

# Get download URL
ASSET_URL=$(curl -s "$API" | grep "browser_download_url" | grep -i "darwin" | grep -i "$ASSET_PATTERN" | head -1 | cut -d '"' -f 4)

if [ -z "$ASSET_URL" ]; then
  # Try universal
  ASSET_URL=$(curl -s "$API" | grep "browser_download_url" | grep -i "darwin" | head -1 | cut -d '"' -f 4)
fi

if [ -z "$ASSET_URL" ]; then
  echo "Could not find macOS release. Please download manually from:"
  echo "  https://github.com/$REPO/releases"
  exit 1
fi

echo "Downloading..."
curl -L -o /tmp/Chimera.dmg "$ASSET_URL"

echo "Mounting DMG..."m -rf /tmp/Chimera-mount
mkdir -p /tmp/Chimera-mount
hdiutil attach /tmp/Chimera.dmg -mountpoint /tmp/Chimera-mount -nobrowse

echo "Installing to /Applications..."
cp -R /tmp/Chimera-mount/Chimera.app /Applications/

hdiutil detach /tmp/Chimera-mount
rm -f /tmp/Chimera.dmg

# Check Docker
echo "Checking Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "WARNING: Docker not found. Chimera requires Docker to run the backend."
  echo "Install Docker Desktop: https://docs.docker.com/desktop/install/mac-install/"
fi

echo ""
echo "=== Installation complete ==="
echo "Starting Chimera..."
open /Applications/Chimera.app
