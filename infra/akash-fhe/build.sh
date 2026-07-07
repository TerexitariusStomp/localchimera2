#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:-ghcr.io/localchimera/fhe-inference:latest}"
PLATFORM="${PLATFORM:-linux/amd64}"

echo "Building FHE inference image: ${IMAGE_TAG}"
docker buildx build --platform "${PLATFORM}" -t "${IMAGE_TAG}" .

if [ "${PUSH:-false}" = "true" ]; then
    echo "Pushing image to registry..."
    docker push "${IMAGE_TAG}"
fi

echo "Build complete: ${IMAGE_TAG}"
