# Upstream Library Tracking — Browser Node

This file tracks the open-source libraries used by the browser-based node feature.
Each library is actively maintained and should be checked regularly for updates.

## How to Update

Run `npm outdated <package>` to check for new versions. After updating, test the
browser node feature end-to-end. Update the "Last Checked" date when verified.

---

## Inference

### @mlc-ai/web-llm — WebGPU LLM Inference
- **npm**: `@mlc-ai/web-llm`
- **Repo**: https://github.com/mlc-ai/web-llm
- **License**: Apache-2.0
- **Current**: 0.2.84 (May 2026)
- **Update cadence**: Frequent (88 versions since May 2023)
- **Used for**: Primary inference engine — runs Llama-3.2-1B in browser via WebGPU
- **Last checked**: 2026-06-29

### @huggingface/transformers — Fallback Inference
- **npm**: `@huggingface/transformers`
- **Repo**: https://github.com/huggingface/transformers.js
- **License**: Apache-2.0
- **Current**: 4.2.0 (Apr 2026)
- **Update cadence**: Very frequent (87 releases, 1.3M weekly downloads)
- **Used for**: Fallback inference when WebGPU unavailable (WASM backend)
- **Last checked**: 2026-06-29

---

## Storage

### helia — IPFS Implementation for JavaScript
- **npm**: `helia`
- **Repo**: https://github.com/ipfs/helia
- **License**: Apache-2.0 / MIT
- **Current**: 6.0.22 (Jun 2026)
- **Update cadence**: Very frequent (648 releases, 438 versions)
- **Used for**: Content-addressed storage in browser via IPFS protocol
- **Last checked**: 2026-06-29

### @helia/unixfs — UnixFS for Helia
- **npm**: `@helia/unixfs`
- **Repo**: https://github.com/ipfs/helia (monorepo)
- **License**: Apache-2.0 / MIT
- **Used for**: File operations (add/cat) on Helia IPFS node
- **Last checked**: 2026-06-29

### multiformats — CID utilities
- **npm**: `multiformats`
- **Repo**: https://github.com/multiformats/js-multiformats
- **License**: Apache-2.0 / MIT
- **Used for**: Parsing CIDs for IPFS file retrieval
- **Last checked**: 2026-06-29

---

## Compute

### @wasmer/sdk — WASI Runtime for Browser
- **npm**: `@wasmer/sdk`
- **Repo**: https://github.com/wasmerio/wasmer-js
- **License**: MIT
- **Current**: 0.10.0 (Dec 2025)
- **Update cadence**: Regular (24 versions since Nov 2023)
- **Used for**: Sandboxed WASI/WASIX execution of compute jobs in browser
- **Notes**: Requires SharedArrayBuffer (needs COOP/COEP headers on server)
- **Last checked**: 2026-06-29

---

## Bandwidth

### Native WebRTC API — Open Web Standard
- **Spec**: https://webrtc.org/
- **MDN**: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- **License**: Open web standard (no npm package needed)
- **Used for**: Browser-native peer-to-peer data channels for bandwidth sharing
- **Notes**: Built into all modern browsers. No external dependency to track.
- **Last checked**: 2026-06-29

---

## Blockchain / Wallet (already in project)

### casper-js-sdk
- **npm**: `casper-js-sdk`
- **Current**: ^5.0.12 (already in package.json)
- **Used for**: Casper blockchain RPC, deploy construction, wallet signing

### Casper Wallet Extension
- **Spec**: Casper Wallet browser extension API
- **Used for**: Wallet connection and deploy signing (provider.sign / signDeploy)
