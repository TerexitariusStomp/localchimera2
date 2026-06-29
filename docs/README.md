# docs/

Documentation for developers and contributors.

## Core Docs

- **UPSTREAM.md** — Catalog of all upstream projects and submodules (LLMwiki, Openviking, OtterWiki, tasking networks). Includes update instructions and version tracking.
- **RELAY_COMPATIBILITY.md** — Archived analysis of tasking networks and why only relay/worker-split-safe providers are kept.

## Provider-Specific Docs

- **CHUTES.md** — Chutes AI miner integration
- **ROUTSTR.md** — Routstr Nostr/Cashu routing
- **OPENVIKING.md** — OpenViking memory bridge setup

## Assessments

- **BANDWIDTH_MEMORY_PROVIDERS_ASSESSMENT.md** — Bandwidth and memory provider evaluation
- **STORAGE_PROVIDERS_ASSESSMENT.md** — Storage provider evaluation (BTFS kept)
- **WALLETS_CREATED.md** — Wallet setup and management notes

## Keeping Up to Date

```bash
# Check all packages for outdated dependencies
./scripts/update-upstream.sh check

# Update to latest compatible versions
./scripts/update-upstream.sh update

# Update forked tasking network submodules
./scripts/update-tasking-forks.sh
```

A GitHub Action also runs weekly to open an issue when upstream updates are available.
