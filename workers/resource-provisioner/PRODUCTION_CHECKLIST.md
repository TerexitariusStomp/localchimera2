# Production Checklist

This checklist confirms the resource provisioner is ready for production use.

## Required configuration

Generate what you can automatically:

```bash
cd workers/resource-provisioner
cp .env.example .env
node scripts/setup-env.js .env
```

Then fill in the remaining values manually:

### Payments / marketplace
- [ ] `PRIVATE_KEY` — EVM key for Request Network.
- [ ] `RPC_URL` — EVM RPC (e.g., Sepolia or Polygon).
- [ ] `CHAIN_ID` — EVM chain ID for Request Network.
- [ ] `CLOUDFLARE_ACCOUNT_ID`
- [ ] `CLOUDFLARE_KV_NAMESPACE_ID`
- [ ] `CLOUDFLARE_API_TOKEN`

### Tasking networks
- [ ] `GOLEM_API_KEY` — default `try_golem` only for testing.
- [ ] `GOLEM_PAYMENT_NETWORK` — `polygon` for mainnet GLM.
- [ ] `MYSTERIUM_API_URL` (default bandwidth provider)
- [ ] `BTFS_API_URL` (default storage provider)
- [ ] `ANYONE_API_URL` (optional, for `BANDWIDTH_PROVIDER=anyone`)
- [ ] `STORJ_BUCKET`, `STORJ_GATEWAY_URL`, `STORJ_UPLINK_BINARY` (optional, for `STORAGE_PROVIDER=storj`)
- [ ] `BTT_AI_API_URL` (default inference provider)
- [ ] `AKASH_API_URL`, `AKASH_SDL_FILE` (optional, for `INFERENCE_PROVIDER=akash` or `COMPUTE_PROVIDER=akash`)
- [ ] `EDGE_NETWORK_API_KEY`
- [ ] `STREAMR_NODE_PRIVATE_KEY`
- [ ] `STREAMR_STREAM_ID`
- [ ] `NAMESILO_API_KEY`
- [ ] `NAMESILO_CONTACT_PROFILE`

### Escrow fallback (volunteer → tasking network)
- [ ] `CASPER_PROVIDER_KEY_PEM` or `CASPER_PROVIDER_KEY_PEM_PATH` — key that acts as the fallback provider on Casper escrow.
- [ ] `CASPER_RPC_URL` and `CASPER_CHAIN_NAME`.
- [ ] `BOTCHAIN_PRIVATE_KEY` — key that acts as the fallback provider on Botchain escrow.
- [ ] `COORDINATOR_PORT` — WebSocket port for the volunteer push-dispatch server (default 8080).
- [ ] `COORDINATOR_AUTH_TOKEN` — auth token volunteers must use to connect.
- [ ] `VOLUNTEER_DISPATCH_MS` — how long to wait for a pushed volunteer to accept a job (default 10s).
- [ ] `VOLUNTEER_DISPATCH_RETRIES` — dispatch retries before fallback (default 2).
- [ ] `FALLBACK_*` defaults for tasking-network sizing.

### On-chain coordinator (Botchain, no central server)
- [ ] Deploy `contracts/ChimeraCoordinator.sol` to Botchain.
- [ ] Set `BOTCHAIN_COORDINATOR_ADDRESS` in the frontend, QVAC, and resource-provisioner env.
- [ ] Verify providers are registered and active in the `ComputeRegistry`.
- [ ] Configure QVAC Botchain bridge to listen for `JobRouted` events (default when `BOTCHAIN_COORDINATOR_ADDRESS` is set).

### On-chain bridge dispatcher (Li.Fi, no central server for fallback)
- [ ] Deploy `contracts/ChimeraBridgeDispatcher.sol` with the Li.Fi diamond address for the target chain.
- [ ] Set `BOTCHAIN_BRIDGE_DISPATCHER_ADDRESS` in the frontend, QVAC, and resource-provisioner env.
- [ ] Call `coordinator.setBridgeDispatcher(dispatcherAddress)`.
- [ ] Call `coordinator.setBridgeData(taskType, receiver, destinationChainId, lifiCallData)` for each supported task type.
- [ ] Call `coordinator.setRefundBridgeData(taskType, refundReceiver, originChainId, refundLifiCallData)` for each supported task type so unfulfilled bridged jobs can be refunded.
- [ ] Call `coordinator.setRefundTimeout(refundTimeoutSeconds)` (default 1 hour) to set the tasking-network fulfillment window.
- [ ] Confirm second-party-only jobs bridge funds during `createJob` without a server.
- [ ] Confirm hybrid jobs hold the full amount in the coordinator and are bridged when `triggerFallback()` is called.
- [ ] Set `STORAGE_PROVIDER` to `storj` (default) or `btfs`, `BANDWIDTH_PROVIDER` to `mysterium` (default) or `anyone`, `INFERENCE_PROVIDER` to `btt-ai` (default) or `akash`, and `COMPUTE_PROVIDER` to `golem` (default, CPU-only) or `akash`. GPU tasks default to Akash when `requiresGpu` or `FALLBACK_REQUIRES_GPU=true` is set; match the bridge data configured on the coordinator.
- [ ] Confirm `coordinator.processExpiredJobs()` scans pending hybrid jobs and triggers fallback for past-deadline jobs, then scans bridged jobs and refunds any whose `refundTimeout` has expired without `markFallbackComplete()` being called.
- [ ] Deploy `ChimeraReactive.sol` to Reactive Network (or Lasna Testnet) with `BOTCHAIN_ORIGIN_CHAIN_ID`, `BOTCHAIN_COORDINATOR_ADDRESS`, and a `REACTIVE_CRON_TOPIC` (e.g., `Cron10` for 10-block intervals).
- [ ] Fund the reactive contract with REACT tokens so it can pay for origin-chain callbacks.
- [ ] Verify the reactive contract emits `Callback` events to `coordinator.processExpiredJobs()` on the origin chain.
- [ ] (Optional) Also register the coordinator with Chainlink Automation or Gelato as a fallback keeper via `checkUpkeep`/`performUpkeep` or `refundFallback`/`processExpiredJobs`.

### Volunteer clients
- [ ] Browser SDK: set `COORDINATOR_URL` (e.g., `wss://coordinator.localchimera.com`) and `COORDINATOR_TOKEN`.
- [ ] QVAC node: set `COORDINATOR_URL` and `COORDINATOR_TOKEN` in the node environment.
- [ ] Set `CHIMERA_PROTOCOL_PAYOUT_ADDRESS` to the protocol multisig / reward address. All reward-bearing miners (Storj, Anyone, Mysterium, BTT AI, Golem) default to this address and never store a private key.
- [ ] Ensure volunteers are registered and connected before creating escrow jobs.

## Verify

Run the verification script before deploy:

```bash
cd workers/resource-provisioner
./verify-production.sh
```

## Deploy

```bash
cd workers/resource-provisioner
./deploy.sh
```

## Runtime checks

1. Check worker logs:
   ```bash
   docker compose logs -f resource-provisioner
   ```
2. Trigger a test order from the frontend Billing tab.
3. Confirm the worker:
   - Detects payment via Request Network.
   - The on-chain bridge (Li.Fi via `ChimeraBridgeDispatcher`) handles token conversion.
   - Rents a Golem provider.
   - Opens a Mysterium tunnel.
   - Adds DNS records for a user-owned domain.
   - Pushes assets to Edge Network CDN.
   - Publishes deployment state and telemetry to Streamr.
   - Pins snapshots to BTFS.
4. Start a volunteer (Browser SDK or QVAC node) and confirm it connects to `COORDINATOR_URL`.
5. Trigger a Casper or Botchain escrow job.
6. Confirm the worker:
   - Detects the pending job.
   - Pushes it to the connected volunteer via the coordinator.
   - The volunteer accepts and returns a result.
   - The worker calls `providerComplete` on the escrow contract.
7. Disconnect the volunteer and trigger another hybrid job.
8. Confirm the on-chain dispatcher:
   - After `fallbackTimeout`, anyone can call `coordinator.triggerFallback()` or `coordinator.processExpiredJobs()`.
   - The coordinator uses the held amount to execute the Li.Fi bridge through `ChimeraBridgeDispatcher`.
   - The coordinator emits `FallbackBridged` and sets `bridged` for the job.
9. If the tasking network fulfills the job, call `coordinator.markFallbackComplete(jobAddress, completionHash)` from the owner or oracle. If the tasking network never fulfills it, wait for `refundTimeout` and call `coordinator.refundFallback(jobAddress)` or `coordinator.processExpiredJobs()`; confirm `RefundBridged` is emitted and `refunded` is set.
10. Confirm the resource-provisioner (or any tasking-network executor) sees `FallbackBridged`, executes the tasking network job, and either relays `markFallbackComplete` or lets the refund proceed.

## GVMI image pipeline

Before production:

1. Build Docker images for each app template.
2. Convert to GVMI:
   ```bash
   gvmkit-build <docker-image>
   ```
3. Publish GVMI hashes to the template registry.
4. Update the frontend to pass `imageTag` with the order.

## Scaling

1. Configure `MIN_INSTANCES`, `MAX_INSTANCES`, `SCALE_UP_THRESHOLD`, `SCALE_DOWN_THRESHOLD`.
2. Feed metrics into Streamr and pin snapshots to BTFS.
3. Run the scaling controller as a separate process or extend the worker loop.

## Logos evaluation

- Monitor Logos (Codex, Nomos, Waku) maturity.
- Replace Streamr with Waku if privacy requirements increase.
- Replace BTFS with Codex for durable storage.
- Evaluate Nomos as a Casper alternative for escrow.

## Known limitations

- Golem rentals are single-activity. Multi-instance deployments require the scaling controller.
- Streamr HTTP API may need the official SDK for advanced features.
- Health checks and auto-replacement are not yet implemented.
- The volunteer registry is currently implicit (escrow contract state). A reputation-weighted coordinator server can be added later to actively dispatch jobs to volunteers before falling back.
- Botchain and Casper fallback paths are implemented; real-world throughput depends on RPC reliability and tasking-network API availability.
