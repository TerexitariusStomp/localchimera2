/**
 * Canonical task-type definitions used across all escrows and volunteer clients.
 *
 * Different escrows use different encodings:
 *   - Browser SDK / Casper: 0=inference, 1=storage, 2=compute, 3=bandwidth
 *   - Botchain: bit flags 1=compute, 2=storage, 4=inference, 8=bandwidth
 *
 * The coordinator always works in canonical space (0-3) and volunteers/job
 * envelopes are normalized before matching.
 */

export const CANONICAL = {
  INFERENCE: 0,
  STORAGE: 1,
  COMPUTE: 2,
  BANDWIDTH: 3,
};

export const CANONICAL_NAMES = {
  0: 'inference',
  1: 'storage',
  2: 'compute',
  3: 'bandwidth',
};

/**
 * Convert a single network-specific task type to canonical.
 * Supports bit-flag encodings (e.g., Botchain) by returning the first matching bit.
 */
export function normalizeTaskType(taskType, network = '') {
  const tt = Number(taskType) || 0;

  if (network === 'botchain') {
    if (tt & 4) return CANONICAL.INFERENCE;
    if (tt & 2) return CANONICAL.STORAGE;
    if (tt & 1) return CANONICAL.COMPUTE;
    if (tt & 8) return CANONICAL.BANDWIDTH;
    return tt <= 3 ? tt : CANONICAL.INFERENCE;
  }

  // Browser SDK and Casper use 0-3 directly
  if (tt >= 0 && tt <= 3) return tt;

  // Bit-flag fallback (if unknown network)
  if (tt & 4) return CANONICAL.INFERENCE;
  if (tt & 2) return CANONICAL.STORAGE;
  if (tt & 1) return CANONICAL.COMPUTE;
  if (tt & 8) return CANONICAL.BANDWIDTH;

  return CANONICAL.INFERENCE;
}

/**
 * Normalize an array of task types (used for volunteer registration).
 */
export function normalizeTaskTypes(taskTypes, network = '') {
  if (!Array.isArray(taskTypes)) return [];
  return taskTypes.map(tt => normalizeTaskType(tt, network));
}

/**
 * Convert a canonical task type back to the network-specific encoding for on-chain calls.
 */
export function toNetworkTaskType(canonicalType, network = '') {
  const c = Number(canonicalType) || 0;
  if (network === 'botchain') {
    switch (c) {
      case CANONICAL.INFERENCE: return 4;
      case CANONICAL.STORAGE: return 2;
      case CANONICAL.COMPUTE: return 1;
      case CANONICAL.BANDWIDTH: return 8;
      default: return 0;
    }
  }
  return c;
}
