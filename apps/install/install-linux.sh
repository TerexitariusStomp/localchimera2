#!/bin/bash
# Chimera Linux Installer — one-click install & run
set -e

REPO="TerexitariusStomp/qvac-chimera"
API="https://api.github.com/repos/$REPO/releases/latest"

echo "=== Chimera Installer for Linux ==="
echo "Fetching latest release..."

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
  TARGET="amd64"
  DEB_PKG="Chimera_*_amd64.deb"
  RPM_PKG="Chimera-*-1.x86_64.rpm"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi

# Get download URL
ASSET_URL=$(curl -s "$API" | grep "browser_download_url" | grep "\.deb" | head -1 | cut -d '"' -f 4)

if [ -z "$ASSET_URL" ]; then
  echo "No .deb release found. Falling back to binary download..."
  BIN_URL=$(curl -s "$API" | grep "browser_download_url" | grep "linux" | head -1 | cut -d '"' -f 4)
  if [ -z "$BIN_URL" ]; then
    echo "Could not find release. Please download manually from:"
    echo "  https://github.com/$REPO/releases"
    exit 1
  fi
  echo "Downloading binary..."
  curl -L -o /tmp/chimera "$BIN_URL"
  chmod +x /tmp/chimera
  echo "Installing to /usr/local/bin/chimera..."
  sudo mv /tmp/chimera /usr/local/bin/chimera
  echo "Starting Chimera..."
  chimera
  exit 0
fi

# Download .deb
echo "Downloading .deb package..."
curl -L -o /tmp/chimera.deb "$ASSET_URL"

# Check if dpkg is available
if command -v dpkg >/dev/null 2>&1; then
  echo "Installing .deb package..."
  sudo dpkg -i /tmp/chimera.deb || sudo apt-get install -f -y
elif command -v rpm >/dev/null 2>&1; then
  # Convert and install via alien, or fall back to rpm
  echo "Converting to RPM..."
  if command -v alien >/dev/null 2>&1; then
    sudo alien -r /tmp/chimera.deb
    sudo rpm -i /tmp/chimera.rpm
  else
    echo "Installing via rpm directly..."
    sudo rpm -i --nodeps /tmp/chimera.deb 2>/dev/null || {
      echo "Please install alien or download the RPM from releases."
      exit 1
    }
  fi
else
  echo "No package manager found. Extracting binary..."
  dpkg-deb -x /tmp/chimera.deb /tmp/chimera-extract
  sudo cp /tmp/chimera-extract/usr/bin/chimera /usr/local/bin/ 2>/dev/null || \
    sudo cp /tmp/chimera-extract/usr/local/bin/chimera /usr/local/bin/ 2>/dev/null || \
    find /tmp/chimera-extract -name "chimera-desktop" -exec sudo cp {} /usr/local/bin/chimera \;
  chmod +x /usr/local/bin/chimera
fi

# Check Docker
echo "Checking Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "WARNING: Docker not found. Chimera requires Docker to run the backend."
  echo "Install Docker: https://docs.docker.com/engine/install/"
fi

echo ""
echo "=== Installation complete ==="
echo "Starting Chimera..."
chimera || /usr/local/bin/chimera || echo "Run 'chimera' to start the app."
