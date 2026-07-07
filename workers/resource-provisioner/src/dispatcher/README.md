# Escrow Fallback Dispatcher

Watches the Casper and Botchain escrow contracts and guarantees every job gets fulfilled, even when no volunteer provider is online.

## How it works

```
User creates job on Casper/Botchain escrow
            │
            ▼
   JobDispatcher polls pending jobs
            │
            ├─ actively dispatches to a connected volunteer
            │   via the VolunteerCoordinator WebSocket server
            │
            └─ if no volunteer accepts / is connected → fallback path
                        │
                        ▼
      ExecutionRouter picks the tasking network
                        │
        ├─ INFERENCE ──► BTT AI
        ├─ COMPUTE ────► Golem
        ├─ STORAGE ────► BTFS
        └─ BANDWIDTH ──► Mysterium
                        │
                        ▼
      providerAck + providerComplete are submitted on-chain
                        │
                        ▼
                 Job settled via escrow
```

Volunteers do **not** poll the blockchain or call `providerAck` to pick up a job. The coordinator pushes jobs to registered volunteers; they execute the work and return the result, and the orchestrator submits the on-chain result.

## Files

- `job-dispatcher.js` — polls both escrows, dispatches to volunteers via the coordinator, falls back to tasking networks.
- `execution-router.js` — maps canonical task types to tasking-network provisioners and hashes the result.
- `../contracts/botchain-client.js` — minimal EVM client for Botchain escrow reads/writes.
- `../contracts/casper-client.js` — minimal Casper client for escrow reads/writes.
- `../coordinator/server.js` — WebSocket coordinator that volunteers connect to.
- `../coordinator/volunteer-registry.js` — registry with capability-based selection.
- `../coordinator/task-types.js` — canonical task-type normalization (Casper 0-3 vs Botchain bit flags 1/2/4/8).

## Configuration

See `.env.example` in the worker root:

- `CASPER_PROVIDER_KEY_PEM` / `CASPER_PROVIDER_KEY_PEM_PATH`
- `BOTCHAIN_PRIVATE_KEY`
- `COORDINATOR_PORT` / `COORDINATOR_AUTH_TOKEN`
- `VOLUNTEER_DISPATCH_MS` / `VOLUNTEER_DISPATCH_RETRIES`
- `FALLBACK_*` sizing defaults
- `BTFS_API_URL`, `MYSTERIUM_API_URL`, `BTT_AI_API_URL`, `GOLEM_API_KEY`

## Connecting volunteers

### WebSocket coordinator (central, optional)

- **Browser SDK**: set `COORDINATOR_URL` (e.g., `wss://coordinator.localchimera.com`) and the browser node will connect automatically.
- **QVAC node**: set `COORDINATOR_URL` and the Casper/Botchain bridges will connect automatically.

### On-chain coordinator (Botchain, no central server)

Deploy `contracts/ChimeraCoordinator.sol` to Botchain and set `BOTCHAIN_COORDINATOR_ADDRESS`:

```bash
cd /home/user/CascadeProjects/localchimera
export PRIVATE_KEY=0x...
export BOTCHAIN_ESCROW_VAULT=0x82bb0e1f4cde3e1285fcd80464680e97833c8d54
export BOTCHAIN_COMPUTE_REGISTRY=0x3737485f189d92a1455ed841fee4e8cc8a353e85
forge script scripts/deploy/DeployChimeraCoordinator.s.sol --rpc-url https://rpc.bohr.life --broadcast
```

The frontend will then create jobs via the coordinator. The coordinator selects an active provider from the `ComputeRegistry` on-chain and emits a `JobRouted` event. QVAC Botchain bridges listen for that event and process the job without needing a central WebSocket server.

## Task dispatch policy

Each job carries a `policy` (uint8):

- `0` — **Hybrid** (default). Volunteers are tried first; if none complete within `fallbackTimeout` (60 seconds by default), the on-chain coordinator automatically bridges the pre-paid bridge fee to a tasking network.
- `1` — **First-party only**. Only Chimera SDK volunteers can execute. Escrow, dispute, and settlement features are fully available. The dispatcher will **never** fall back to tasking networks for these jobs.
- `2` — **Second-party only**. The coordinator bridges the full payment directly to the tasking network during `createJob`. Escrow and dispute features are not available.

When the on-chain coordinator is configured, the dispatcher reads `jobPolicy(jobAddress)` and listens for `FallbackBridged` events to execute the tasking network job after the on-chain bridge has completed.

### Fallback provider selection

The execution router can pick between multiple tasking networks per task type. GPU tasks are routed to Akash because Golem is CPU-only:

| Task type | Default fallback | Alternative | GPU handling |
|-----------|------------------|-------------|--------------|
| Storage   | Storj            | BTFS (`STORAGE_PROVIDER=btfs`) | — |
| Bandwidth | Mysterium        | Anyone Protocol (`BANDWIDTH_PROVIDER=anyone`) | — |
| Compute   | Golem (CPU-only) | Akash (`COMPUTE_PROVIDER=akash`) | GPU tasks default to Akash (`requiresGpu` / `FALLBACK_REQUIRES_GPU`) |
| Inference | BTT AI           | Akash (`INFERENCE_PROVIDER=akash`) | GPU tasks default to Akash (`requiresGpu` / `FALLBACK_REQUIRES_GPU`) |

Set the env vars `STORAGE_PROVIDER`, `BANDWIDTH_PROVIDER`, `COMPUTE_PROVIDER`, `INFERENCE_PROVIDER`, and `FALLBACK_REQUIRES_GPU`, or pass `requiresGpu` / `storageProvider` / `computeProvider` / `inferenceProvider` / `bandwidthProvider` in the fallback config.

## On-chain bridge dispatcher (Li.Fi)

The `ChimeraBridgeDispatcher` contract makes the fallback step fully on-chain and serverless:

1. Deploy `ChimeraBridgeDispatcher.sol` and set `BOTCHAIN_BRIDGE_DISPATCHER_ADDRESS`.
2. Call `coordinator.setBridgeDispatcher(dispatcher)` and `coordinator.setBridgeData(...)` for each task type.
3. Configure the refund bridge for each task type with `coordinator.setRefundBridgeData(...)`. This is used to return funds to the origin chain if the tasking network never fulfills the job.
4. Set `coordinator.setRefundTimeout(...)` (default 1 hour). After a job is bridged, the tasking network has this window to complete it.
5. For **second-party-only** jobs, the coordinator bridges the full amount to the tasking network during `createJob` — no server is involved.
6. For **hybrid** jobs, the full amount is held in the coordinator. If the volunteer misses the deadline, the held amount is bridged to the tasking network via `coordinator.triggerFallback()`.
7. Automated fallback and refund scanning is handled by **Reactive Network**:
   - Deploy `ChimeraReactive.sol` to Reactive Network (or Lasna Testnet).
   - It subscribes to a built-in CRON topic and periodically emits a callback to `coordinator.processExpiredJobs()` on the origin chain.
   - `processExpiredJobs()` scans all pending hybrid jobs and triggers fallback for each job whose deadline has passed, then scans all bridged jobs and refunds any whose `refundTimeout` has expired without `markFallbackComplete()` being called.
8. The coordinator also implements `AutomationCompatibleInterface` (`checkUpkeep`/`performUpkeep`) so alternative keeper networks (e.g., Chainlink Automation or Gelato) can also call `triggerFallback` or `refundFallback` automatically.
9. When a tasking-network executor successfully completes a job, it should relay a completion signal to the owner so `coordinator.markFallbackComplete(jobAddress, completionHash)` can be called. This prevents the refund from being triggered.
10. The coordinator emits `FallbackBridged` and `RefundBridged`. The resource-provisioner (or any tasking-network executor) can optionally listen for these events to track the job lifecycle, but the routing and bridging themselves require no central server.

## Production notes

- The dispatcher and coordinator are started automatically by `src/index.js`.
- It is safe to run alongside volunteer nodes: a job is only fallen back to if no connected volunteer accepts it within `VOLUNTEER_DISPATCH_MS`.
- The dispatcher uses the protocol’s keys to call `providerAck` and `providerComplete` on the escrow. These keys should be funded with enough native token (CSPR / BOT) for transaction fees.
- If a volunteer accepts the job and returns a result, the orchestrator submits the result on-chain and the volunteer earns the reward.
