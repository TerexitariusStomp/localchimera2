# Upstream Projects

This repo integrates and extends several open-source projects. This document tracks where each comes from, how it is consumed, and how to update it.

## Core Infrastructure

| Project | Upstream Repo | How We Consume | Current Version | Last Checked |
|---|---|---|---|---|
| **QVAC SDK** | `npm:@qvac/sdk` | npm dependency | `^0.13.2` | 2026-06-18 |
| **Pear Runtime** | `npm:pear-runtime` | npm dependency | `^1.0.0` | 2026-06-18 |
| **Hyperswarm** | `npm:hyperswarm` | npm dependency | `^4.0.0` | 2026-06-18 |
| **Hypercore** | `npm:hypercore` | npm dependency | `^10.0.0` | 2026-06-18 |
| **Tauri** | `github:tauri-apps/tauri` | npm + GitHub Actions | `^2.0.0` | 2026-06-18 |
| **Capacitor** | `github:ionic-team/capacitor` | npm + mobile projects | `^7.0.0` | 2026-06-18 |

## Mining Networks

Only tasking networks that are **safe on untrusted hardware** are integrated. They are consumed as **forked Git submodules** under `upstream/`. This keeps their larger contributor bases driving the code while giving Localchimera a stable, reviewable integration point. To fork them into your own GitHub org and repoint `.gitmodules`, run:

```bash
./scripts/fork-upstream.sh <your-github-username-or-org>
```

| Project | Upstream Repo | Submodule Path | How We Consume | Included in SDK? | Notes |
|---|---|---|---|---|---|
| **Chutes** | `github.com/chutesai/chutes-miner` | `upstream/chutes-miner` | Protocol integration (`qvac/src/miners/ChutesMiner.js`) | ✅ | Untrusted-hardware-safe (relay holds keys) |
| **Routstr** | `github.com/routstr/routstr-core` | `upstream/routstr-core` | Protocol integration (`qvac/src/miners/RoutstrMiner.js`) | ✅ | Nostr/Cashu, no local keys |
| **Earnidle** | `earnidle.com` (no public repo) | n/a | Protocol integration (`sdk/src/miners/EarnidleProvider.js` + `qvac/src/miners/EarnidleMiner.js`) | ✅ | Public wallet address only |
| **BTT AI** | `github.com/BTT-AI-labs/miner-cli` | `upstream/btt-ai-miner` | Docker / GPU miner (`sdk/src/miners/BttAiMinerProvider.js`) | ✅ | Proxy mode, no local wallet |
| **Golem** | `github.com/golemcloud/golem-runner` | `upstream/golem-runner` | Docker provider (`sdk/src/miners/GolemProvider.js`) | ✅ | Payout address only |
| **Anyone Protocol** | `github.com/anyone-protocol/anyone` | `upstream/anyone-protocol` | Docker relay (`sdk/src/miners/AnyoneProtocolProvider.js`) | ✅ | No keys required |
| **Mysterium** | `github.com/mysteriumnetwork/node` | `upstream/mysterium-node` | Docker VPN node (`sdk/src/miners/MysteriumProvider.js`) | ✅ | No keys required |
| **BTFS** | `github.com/bittorrent/go-btfs` | `upstream/btfs` | Walletless storage network (`sdk/src/miners/BtfsStorageProvider.js`) | ✅ | No BTT wallet on device; storage-host mode disabled; payments on Casper |

Networks that require a private key, wallet mnemonic, account credentials, or self-managed config on the local machine have been removed from the codebase entirely because they cannot safely run on untrusted hardware and their upstream protocols do not support a relay/worker split. The old analysis is archived in `docs/RELAY_COMPATIBILITY.md` for reference.

## Wiki / Knowledge Base

| Project | Upstream Repo | How We Consume | Our Code | Update Method |
|---|---|---|---|---|
| **LLMwiki** | `github.com/lucasastorian/llmwiki` | **Git submodule** — vendored in `upstream/llmwiki/` | `qvac/src/llmwiki/bridge.py` | `git submodule update --remote upstream/llmwiki` |
| **Openviking** | `github.com/volcengine/OpenViking` | **Git submodule** — vendored in `upstream/openviking/` | `qvac/src/llmwiki/openviking_bridge.py` (HTTP client) | `git submodule update --remote upstream/openviking` |
| **OtterWiki** | `github.com/redimp/otterwiki` | **Git submodule** — vendored in `upstream/otterwiki/` | `qvac/src/llmwiki/otterwiki_bridge.py` (GitStorage wrapper) | `git submodule update --remote upstream/otterwiki` |
| **Knowledge Catalog / OKF** | `github.com/GoogleCloudPlatform/knowledge-catalog` | **Git submodule** — vendored in `upstream/knowledge-catalog/` | `docs/UPSTREAM.md` (OKF spec) | `git submodule update --remote upstream/knowledge-catalog` |

## Tools / File Conversion

| Project | Upstream Repo | How We Consume | Our Code | Update Method |
|---|---|---|---|---|
| **repo-to-markdown** | `github.com/puter-apps/repo-to-markdown` | **Git submodule** — vendored in `upstream/repo-to-markdown/` | `qvac/src/web/repoToMarkdownAdapter.js` + `repoDigest.js` | `git submodule update --remote upstream/repo-to-markdown` |
| **markitdown** | `github.com/microsoft/markitdown` | **Git submodule** — installed via `requirements.txt` (`-e ../upstream/markitdown/packages/markitdown`) | `qvac/src/web/server.js` (`handleConvertToMd`) | `git submodule update --remote upstream/markitdown` |

## Fully Homomorphic Encryption (FHE)

| Project | Upstream Repo | Submodule Path | How We Consume | Notes |
|---|---|---|---|---|
| **Zama Concrete** | `github.com/zama-ai/concrete` | `upstream/concrete` | Reference design and upstream API model | Rust FHE compiler; tracked for API patterns and future migration |
| **Zama fhEVM** | `github.com/zama-ai/fhevm` | `upstream/fhevm` | On-chain encrypted state / contract integration | Solidity FHE runtime for EVM; tracked for encrypted on-chain inference jobs and results |

The FHE runtime shipped in this repo uses **Microsoft SEAL** (`node-seal`) because it provides a portable WebAssembly build that works in both the browser (tasker) and Node.js (provider). The Concrete and fhEVM submodules are maintained as upstream references: Concrete for the FHE API model and fhEVM for migrating the on-chain job/result state to encrypted EVM contracts.

## Git Submodules (Upstream Code We Use Directly)

We vendor upstream repos as git submodules so their code is always available and we can import from them directly. This avoids maintaining parallel implementations.

### Initial clone with submodules

```bash
git clone --recurse-submodules https://github.com/TerexitariusStomp/localchimera.git
```

### Update all submodules to latest upstream

```bash
git submodule update --remote --merge
# Commit the updated submodule refs
git add upstream/ && git commit -m "chore: bump upstream submodules"
```

### Individual submodule updates

```bash
git submodule update --remote upstream/markitdown
git submodule update --remote upstream/llmwiki
git submodule update --remote upstream/repo-to-markdown
git submodule update --remote upstream/openviking
git submodule update --remote upstream/otterwiki
git submodule update --remote upstream/knowledge-catalog
```

### Current submodules

| Submodule | Path | Installed Via |
|---|---|---|
| `microsoft/markitdown` | `upstream/markitdown/` | `pip install -e upstream/markitdown/packages/markitdown` |
| `lucasastorian/llmwiki` | `upstream/llmwiki/` | Referenced directly; thin wrapper in `qvac/src/llmwiki/` |
| `puter-apps/repo-to-markdown` | `upstream/repo-to-markdown/` | Referenced directly; custom adapter in `qvac/src/web/repoDigest.js` |
| `volcengine/OpenViking` | `upstream/openviking/` | `qvac/src/llmwiki/openviking_bridge.py` — memory storage via HTTP client |
| `redimp/otterwiki` | `upstream/otterwiki/` | `qvac/src/llmwiki/otterwiki_bridge.py` — git-backed wiki storage |
| `GoogleCloudPlatform/knowledge-catalog` | `upstream/knowledge-catalog/` | Reference OKF spec at `upstream/knowledge-catalog/okf/SPEC.md` |
| `zama-ai/concrete` | `upstream/concrete/` | Reference design and upstream API model for FHE layer |
| `zama-ai/fhevm` | `upstream/fhevm/` | Solidity FHE runtime for encrypted on-chain inference jobs and results |
| **Tasking network forks** | `upstream/*` | Docker or binary builds; protocol wrappers in `qvac/src/miners/` and `sdk/src/miners/` |

Tasking-network submodules are listed in `.gitmodules` and forked into the Localchimera GitHub org via `scripts/fork-upstream.sh`. After forking, update them with:

```bash
# Update all forked tasking submodules to the latest upstream commits
git submodule update --remote --merge \
  upstream/chutes-miner \
  upstream/routstr-core \
  upstream/btt-ai-miner \
  upstream/golem-runner \
  upstream/anyone-protocol \
  upstream/mysterium-node
# Commit the updated submodule refs
git add upstream/ && git commit -m "chore: bump tasking network forks"
```

## Updating npm Dependencies

```bash
# Check all packages for outdated dependencies
./scripts/update-upstream.sh check

# Update all packages to latest compatible versions
./scripts/update-upstream.sh update

# Update lockfiles after manual edits
./scripts/update-upstream.sh install
```

## Updating QVAC SDK

The QVAC SDK (`@qvac/sdk`) powers all inference. To update:

```bash
cd qvac
npm update @qvac/sdk
# Test inference layer
cd ../sdk
npm test
```

Breaking changes in the SDK may require updates to `qvac/src/inference/QVACSDKWrapper.js` and `qvac/src/inference/LocalLLM.js`.

## Updating Pear / P2P Stack

The Pear P2P stack (`pear-runtime`, `hyperswarm`, `hypercore`) is managed as npm dependencies:

```bash
cd qvac
npm update pear-runtime hyperswarm hypercore @hyperswarm/secret-stream
# Restart the node and verify P2P connections
npm start
```

Breaking changes in Pear may require updates to `qvac/src/p2p/PearP2P.js`.

## Updating Tauri

Tauri is consumed in two places:
1. `apps/desktop/package.json` (npm deps)
2. `apps/desktop/src-tauri/Cargo.toml` (Rust deps)

```bash
cd apps/desktop
npm update @tauri-apps/api @tauri-apps/cli
# Also update Rust deps
cd src-tauri
cargo update
```

## Updating Capacitor (Mobile)

```bash
cd qvac/frontend
npm update @capacitor/core @capacitor/ios @capacitor/android
npx cap sync
```

## Updating Mining Networks

Each mining network is vendored as a forked Git submodule. The protocol integration layer in `qvac/src/miners/` and `sdk/src/miners/` is thin by design, so upstream improvements can be pulled in with minimal Localchimera changes.

### Workflow

1. **Fork once**: `scripts/fork-upstream.sh <owner>` forks every listed network repo into your GitHub org and repoints `.gitmodules`.
2. **Pull upstream regularly**: `git submodule update --remote --merge upstream/<name>` merges the latest upstream commits into your fork's submodule pointer.
3. **Check protocol changes**: review upstream releases and diffs before updating the submodule pointer.
4. **Test the miner**: run the relevant Localchimera miner in isolation after bumping a submodule.
5. **Commit**: include the upstream release/change reference in the commit message.

### Example: bump Chutes

```bash
git submodule update --remote --merge upstream/chutes-miner
cd qvac
npm test -- --grep ChutesMiner
```

## Updating Wiki / Knowledge Base

These are now **vendored as git submodules** in `upstream/` and integrated into the codebase:

- **LLMwiki** — Vendored at `upstream/llmwiki/`. Our `bridge.py` is a thin QVAC-specific wrapper
- **Openviking** — Vendored at `upstream/openviking/`. Integrated via `qvac/src/llmwiki/openviking_bridge.py` using plain urllib over HTTP (no compiled Rust extension needed). Stores wiki content as session memory. Requires the real OpenViking server running at `OPENVIKING_URL` (default `http://localhost:1933`). We also ship a custom image with `llama-cpp-python` and local embeddings pre-installed: `upstream/openviking/Dockerfile.local` + `upstream/openviking/ov.conf`.
- **OtterWiki** — Vendored at `upstream/otterwiki/`. Integrated via `qvac/src/llmwiki/otterwiki_bridge.py` wrapping `GitStorage`. All wiki CRUD (`save`, `get`, `list`, `search`, `delete`) delegates to OtterWiki's git-backed storage.
- **Knowledge Catalog / OKF** — Vendored at `upstream/knowledge-catalog/`. Reference `upstream/knowledge-catalog/okf/SPEC.md`

### How the integrations work

**repo-to-markdown** (`qvac/src/web/repoToMarkdownAdapter.js`)
- Ports the upstream browser JS logic to Node.js
- For GitHub URLs: fetches repo tree via GitHub API, downloads raw files, and concatenates into Markdown
- Local directories still use the directory walker but with upstream-compatible formatting

**OtterWiki** (`qvac/src/llmwiki/otterwiki_bridge.py`)
- Wraps `otterwiki.gitstorage.GitStorage`
- Wiki pages are stored in `llmwiki-data/otterwiki/` as a git repository
- `server.js` calls the bridge via Python subprocess for every wiki operation

**OpenViking** (`qvac/src/llmwiki/openviking_bridge.py`)
- Uses plain urllib to talk to the real OpenViking server over HTTP (no compiled Rust extension needed)
- Stores each saved wiki page as an assistant message in the `chimera-default` session
- Retrieves session context for AI prompts
- Requires the real OpenViking server (see `docs/OPENVIKING.md`)

To incorporate upstream improvements:
1. Update the submodule: `git submodule update --remote upstream/<name>`
2. Compare upstream changes against our wrappers
3. Port changes manually where applicable

## Automated Upstream Checks

A GitHub Action runs weekly to check for new upstream releases and opens an issue if any are found. See `.github/workflows/check-upstream.yml`.

It checks:
- All npm packages (`npm outdated`)
- Does NOT yet check GitHub releases for miner protocols (future enhancement)
