/**
 * Shared protocol payout address for external DePIN miners.
 *
 * All miner providers should use this public address (or the operator-supplied
 * CHIMERA_PROTOCOL_PAYOUT_ADDRESS) for receiving network rewards. No provider
 * should ever ask for, store, or expose a private key.
 */
export const DEFAULT_PROTOCOL_PAYOUT_ADDRESS = '0x7eB4A545F875FC1Da252661d31a3e28e67bf723f';

export function getProtocolPayoutAddress(opts = {}) {
  return (
    opts.payoutAddress ||
    opts.rewardAddress ||
    opts.evmAddress ||
    process.env.CHIMERA_PROTOCOL_PAYOUT_ADDRESS ||
    DEFAULT_PROTOCOL_PAYOUT_ADDRESS
  );
}
