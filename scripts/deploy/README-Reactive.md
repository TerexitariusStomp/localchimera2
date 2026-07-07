# Reactive Network Automation for Chimera Hybrid Fallback

This guide deploys `ChimeraReactive` on Reactive Network (or the Lasna testnet) so that hybrid jobs are automatically bridged to the tasking network when their deadline passes.

## How it works

1. `ChimeraCoordinator` creates hybrid jobs and holds the full amount in the coordinator; second-party-only jobs are bridged immediately.
2. The coordinator exposes `processExpiredJobs()`, which scans all jobs and:
   - calls `triggerFallback()` for each unpaid hybrid job whose deadline has passed, and
   - calls `refundFallback()` for each bridged job whose tasking-network refund window has expired without `markFallbackComplete()` being called.
3. `ChimeraReactive` is deployed on Reactive Network and subscribes to a built-in CRON topic. On each CRON tick it emits a callback to the origin chain, calling `ChimeraCoordinator.processExpiredJobs()`.
4. The fallback logic bridges the held amount via `ChimeraBridgeDispatcher`; the refund logic bridges the same amount back via the configured refund bridge data.
5. An authorized owner (or destination-chain oracle/relayer) can call `markFallbackComplete()` to prevent a refund for a successfully fulfilled tasking-network job.

## Prerequisites

- A Reactive Network RPC URL and deployer key with REACT for gas.
- The origin-chain `ChimeraCoordinator` address.
- The origin-chain EIP155 chain ID.
- A CRON topic for the desired tick interval.

## CRON topics

| Topic | Event hash |
|-------|------------|
| Cron1 | `0xf02d6ea5c22a71cffe930a4523fcb4f129be6c804db50e4202fb4e0b07ccb514` |
| Cron10 | `0x04463f7c1651e6b9774d7f85c85bb94654e3c46ca79b0c16fb16d4183307b687` |
| Cron100 | `0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70` |
| Cron1000 | `0xe20b31294d84c3661ddc8f423abb9c70310d0cf172aa2714ead78029b325e3f4` |

Choose a tick that matches the desired fallback latency. The coordinator's `fallbackTimeout` is 60 seconds on Botchain, so a 10-block interval is usually fine if blocks are ~6 seconds.

## Deploy

```bash
export REACTIVE_RPC_URL=https://lasna.reactive.network/...
export REACTIVE_PRIVATE_KEY=0x...
export BOTCHAIN_ORIGIN_CHAIN_ID=968
export BOTCHAIN_COORDINATOR_ADDRESS=0x...
export REACTIVE_CRON_TOPIC=0x04463f7c1651e6b9774d7f85c85bb94654e3c46ca79b0c16fb16d4183307b687

forge script scripts/deploy/DeployChimeraReactive.s.sol \
  --rpc-url $REACTIVE_RPC_URL \
  --private-key $REACTIVE_PRIVATE_KEY \
  --broadcast
```

The script deploys with `0.01 ether` to fund initial callback gas. Top up the deployed contract with REACT as needed for ongoing callbacks.

## Verify on Reactscan

```bash
forge verify-contract \
  --verifier sourcify \
  --chain-id 5318007 \
  $REACTIVE_ADDR \
  ChimeraReactive
```

## Pause / Resume

If the contract needs maintenance, call `pause()` or `resume()` from the owner address:

```bash
cast send $REACTIVE_ADDR "pause()" --rpc-url $REACTIVE_RPC_URL --private-key $REACTIVE_PRIVATE_KEY
cast send $REACTIVE_ADDR "resume()" --rpc-url $REACTIVE_RPC_URL --private-key $REACTIVE_PRIVATE_KEY
```

## Testing on Lasna Testnet

1. Deploy the coordinator, bridge dispatcher, and reactive contract on their respective chains.
2. Configure the coordinator with forward bridge data, refund bridge data, dispatcher, and refund timeout.
3. Create a hybrid job with a short deadline (for testing, temporarily set `fallbackTimeout` to a low value).
4. Do not have a volunteer complete it.
5. Wait for the CRON tick; the reactive contract should emit a `Callback` event targeting `processExpiredJobs()`.
6. Confirm the `FallbackBridged` event on the origin chain and that the coordinator's `bridged` flag for the job is `true`.
7. Without calling `markFallbackComplete()`, wait for the refund window to expire; the next CRON tick should trigger `RefundBridged` and the coordinator's `refunded` flag should be `true`.

For local Foundry testing, see `test/ChimeraCoordinator.t.sol` which exercises the hybrid flow, `payVolunteer`, `triggerFallback`, `triggerFallbackForExpiredJobs`, `refundFallback`, and `processExpiredJobs` with mocked dependencies.
