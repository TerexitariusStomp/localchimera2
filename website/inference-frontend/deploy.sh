#!/bin/bash
set -e
cd "$(dirname "$0")"
npx wrangler pages deploy dist --project-name new-localchimera
