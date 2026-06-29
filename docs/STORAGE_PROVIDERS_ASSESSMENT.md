# Storage Providers Assessment — Consumer Hardware (Archived)

> **Archived**: The self-hosted storage providers below (BTFS, 0Chain Blobber / ZCN) have been **removed from the Localchimera codebase** because they require a local wallet or credentials on the machine and cannot safely run on untrusted hardware. This document is kept as a personal build assessment only. Sia hostd and Hippius are not integrated either.

## This Machine

| Resource | Value |
|----------|-------|
| CPU | 8 cores |
| RAM | 11 GB total (2.4 GB available, swap full) |
| Disk (/home) | 679 GB available |
| Disk (/tmp) | 309 MB available (tmpfs — RAM-backed) |
| GPU | None |

---

## Build Results

| Provider | Language | Built? | Binary Size | Notes |
|----------|----------|--------|-------------|-------|
| **Sia hostd** | Go 1.26 | ✅ Yes | 42 MB | Required `GOTOOLCHAIN=auto` |
| **0Chain Blobber** | Go 1.22 | ✅ Yes | 57 MB | Built from `code/go/0chain.net/blobber` |
| **BTFS** | Go 1.23 | ❌ No | — | `go-libutp` C compilation error on this GCC |
| **Hippius** | Ansible/Rust | N/A | — | Ansible playbook (no compile step) |
| **Filecoin Lotus** | Go | ❌ No | — | Build needs >1 GB /tmp; failed on tmpfs |
| **Arweave** | Erlang | ❌ No | — | Erlang/OTP not installed |

---

## Consumer Hardware Viability

| Provider | Can Run on Everyday Hardware? | Blocker | Relaxable? |
|----------|------------------------------|---------|------------|
| **BTFS** | ❌ Removed from Localchimera | Local BTT wallet required | No — embedded wallet; no relay API |
| **Sia hostd** | ⚠️ Not integrated | Needs 4 TB+ storage, 8 GB RAM | Partial — storage is hard requirement |
| **Hippius** | ⚠️ Not integrated | Needs 2 TB+, 16 GB RAM, ZFS | Partial — can run with relaxed Ansible vars |
| **0Chain Blobber** | ❌ Removed from Localchimera | Need tokens for stake | No — local ZCN wallet required |
| **Filecoin Lotus** | ❌ No | 256 GB RAM, GPU 11 GB+, 2 TB NVME | No — sealed proofs need GPU |
| **Arweave** | ❌ No | Stores entire weave (100 GB+ and growing) | No — storage requirement is fundamental |

---

## Detailed Analysis

### 1. BTFS (go-btfs) — Consumer-Friendly ⭐

**Why it works for everyday hardware:**
- Designed for end users with spare disk space
- No GPU requirement
- Moderate RAM usage
- Can run with minimal storage (test mode)

**Why it failed to build here:**
- `github.com/anacrolix/go-libutp` has a `typedef uint8 bool;` that conflicts with newer GCC
- This is a known upstream issue, fixable with a patch

**To fix:**
```bash
cd upstream/btfs
# Patch go-libutp for newer GCC
sed -i 's/typedef uint8 bool;/\/\/ typedef uint8 bool; \/\/ patched for modern GCC/' \
  $(find . -path "*/go-libutp/utp_types.h")
TMPDIR=/home/user/tmp go build -o btfs ./cmd/btfs
```

**Runtime requirements:**
- CPU: 2+ cores
- RAM: 2–4 GB
- Storage: 50 GB+ (configurable)

---

### 2. Sia hostd — Moderate Consumer Hardware

**Why it can work:**
- Built successfully on this machine
- Binary is small (42 MB)
- Can run on quad-core, 8 GB RAM

**Why it's marginal:**
- Recommended: 4 TB+ HDD for renter data
- 256 GB SSD for consensus data
- Needs port forwarding (9981–9984)

**Runtime requirements:**
- CPU: 4 cores
- RAM: 8 GB
- Storage: 256 GB SSD + 4 TB+ HDD
- Network: stable, ports open

---

### 3. Hippius (thenervelab/hippius-storage-miner) — Marginal

**Why it's marginal:**
- Ansible-based deployment with many moving parts (IPFS, ZFS, HAProxy, Subtensor)
- Official requirements: 4+ cores, 16 GB RAM, 2 TB+ NVME, 1 Gbps
- Bittensor subnet registration needed

**Why it might work with relaxation:**
- Ansible variables can be tuned
- IPFS can use smaller repo
- ZFS can be skipped for testing

**Runtime requirements (official):**
- CPU: 4–8 cores
- RAM: 16–32 GB
- Storage: 100 GB SSD (OS) + 2 TB+ NVME (ZFS)
- Network: 1 Gbps, 5–10 TB/month traffic

---

### 4. 0Chain Blobber — Likely Consumer-Friendly

**Why it can work:**
- Built successfully (57 MB binary)
- Go-based, lightweight
- No GPU requirement

**Unknowns:**
- Exact runtime RAM/storage requirements unclear
- Needs ZCN tokens for stake
- Requires connection to 0Chain sharders/miners

**Runtime requirements (estimated):**
- CPU: 4 cores
- RAM: 4–8 GB
- Storage: 100 GB+ (configurable)

---

### 5. Filecoin Lotus — NOT Consumer-Friendly ❌

**Why it cannot run on everyday hardware:**
- **256 GB RAM required** for sealing
- **NVIDIA GPU with 11 GB+ VRAM** required for proofs
- **2 TB NVME** required for sealing scratch space
- Even the daemon alone recommends 32 GB RAM

**Can any part run on consumer hardware?**
- `lotus daemon` (node only, no mining): 32 GB RAM minimum
- This machine has 11 GB — **insufficient even for the daemon**

**Verdict:** Exclude from consumer SDK.

---

### 6. Arweave — NOT Consumer-Friendly ❌

**Why it cannot run on everyday hardware:**
- Stores the **entire Arweave weave** (100 GB+ and constantly growing)
- Needs Erlang/OTP (not installed here)
- Storage requirement is **fundamental** — you can't participate without storing data

**Can any part run on consumer hardware?**
- No. Arweave nodes are archival by design.

**Verdict:** Exclude from consumer SDK.

---

## Summary for SDK Integration

| Provider | Localchimera? | Reason |
|----------|---------------|--------|
| **BTFS** | ❌ Removed | Local BTT wallet required; no relay/worker split |
| **Sia hostd** | ❌ Not integrated | High storage requirements; not in current scope |
| **Hippius** | ❌ Not integrated | Complex Ansible setup, high requirements |
| **0Chain Blobber** | ❌ Removed | Local ZCN wallet + stake required; no relay/worker split |
| **Filecoin Lotus** | ❌ No | 256 GB RAM + GPU required |
| **Arweave** | ❌ No | Archival storage, 100 GB+ weave |

---

## Recommended Action

No storage providers are currently integrated into Localchimera because all evaluated self-hosted options require a local wallet or credentials on the machine. The build notes above are kept for reference only.
