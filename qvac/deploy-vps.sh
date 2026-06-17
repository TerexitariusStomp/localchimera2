#!/bin/bash
# Deploy QVAC Chimera to Hostinger VPS
set -e

REPO_URL="https://github.com/TerexitariusStomp/qvac-chimera.git"
DEPLOY_DIR="~/qvac-chimera"
NODE_VERSION="20"

echo "=== Chimera VPS Deploy Script ==="

# Update system
sudo apt-get update -y

# Install Node.js if not present
if ! command -v node &> /dev/null; then
  echo "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Install git
sudo apt-get install -y git

# Install build tools for native modules
sudo apt-get install -y build-essential python3

# Clone or pull repo
if [ -d "$DEPLOY_DIR" ]; then
  echo "Pulling latest..."
  cd "$DEPLOY_DIR" && git pull origin main
else
  echo "Cloning repo..."
  git clone "$REPO_URL" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi

# Install dependencies
cd qvac
npm install

# Build frontend
cd frontend
npm install
npm run build
cd ..

# Clean up old dist and copy fresh build
rm -rf dist
mkdir -p dist
cp -r frontend/dist/* dist/
cp dist/index.html dist/404.html 2>/dev/null || true

# Start with PM2 (install if needed)
if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2
fi

# Save old process if running
pm2 delete qvac-chimera 2>/dev/null || true

# Start app
pm2 start src/index.js --name qvac-chimera --cwd "$DEPLOY_DIR/qvac"
pm2 save
pm2 startup systemd -u $(whoami) --hp $HOME

echo "=== Deploy Complete ==="
echo "App should be running on port 3002"
echo "Check: pm2 logs qvac-chimera"
