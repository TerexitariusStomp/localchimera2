#!/bin/bash
set -e

DIST_DIR="./dist"
CONSOLE_DIR="../../website-new/console"

copy_dist() {
  local dest="$1"
  mkdir -p "$dest"
  rm -rf "$dest/assets" "$dest/index.html" "$dest/deploy-escrow.html"
  cp "$DIST_DIR/index.html" "$dest/index.html"
  cp -r "$DIST_DIR/assets" "$dest/assets" 2>/dev/null || true
  for asset in "$DIST_DIR"/*.png "$DIST_DIR"/*.svg "$DIST_DIR"/*.jpg "$DIST_DIR"/*.jpeg "$DIST_DIR"/*.wasm; do
    if [ -f "$asset" ]; then
      cp "$asset" "$dest/"
    fi
  done
  if [ -f "$DIST_DIR/deploy-escrow.html" ]; then
    cp "$DIST_DIR/deploy-escrow.html" "$dest/"
  fi
}

# Copy the built inference app into the root console directory so it serves at /console
copy_dist "$CONSOLE_DIR"
echo "Post-build: inference app copied to /console/"
