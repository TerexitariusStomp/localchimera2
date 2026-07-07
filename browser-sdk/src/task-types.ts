/** Canonical task types used by the resource provisioner and coordinator. */
export const TASK_TYPE = {
  INFERENCE: 0,
  STORAGE: 1,
  COMPUTE: 2,
  BANDWIDTH: 3,
} as const;

/** Botchain bit-flag task types used by the on-chain coordinator. */
export const TASK_TYPE_BOTCHAIN = {
  COMPUTE: 1,
  STORAGE: 2,
  INFERENCE: 4,
  BANDWIDTH: 8,
} as const;

/** Human-readable names for canonical task types. */
export const TASK_TYPE_NAME = {
  [TASK_TYPE.INFERENCE]: 'inference',
  [TASK_TYPE.STORAGE]: 'storage',
  [TASK_TYPE.COMPUTE]: 'compute',
  [TASK_TYPE.BANDWIDTH]: 'bandwidth',
} as const;

/** Job policies for the on-chain coordinator. */
export const TASK_POLICY = {
  HYBRID: 0,
  FIRST_PARTY_ONLY: 1,
  SECOND_PARTY_ONLY: 2,
} as const;

/** Convert a single network-specific task type to canonical SDK space. */
export function normalizeTaskType(taskType: number | string, network = ''): number {
  const tt = Number(taskType) || 0;

  if (network === 'botchain') {
    if (tt & TASK_TYPE_BOTCHAIN.INFERENCE) return TASK_TYPE.INFERENCE;
    if (tt & TASK_TYPE_BOTCHAIN.STORAGE) return TASK_TYPE.STORAGE;
    if (tt & TASK_TYPE_BOTCHAIN.COMPUTE) return TASK_TYPE.COMPUTE;
    if (tt & TASK_TYPE_BOTCHAIN.BANDWIDTH) return TASK_TYPE.BANDWIDTH;
    return tt <= 3 ? tt : TASK_TYPE.INFERENCE;
  }

  if (tt >= 0 && tt <= 3) return tt;

  // Bit-flag fallback
  if (tt & TASK_TYPE_BOTCHAIN.INFERENCE) return TASK_TYPE.INFERENCE;
  if (tt & TASK_TYPE_BOTCHAIN.STORAGE) return TASK_TYPE.STORAGE;
  if (tt & TASK_TYPE_BOTCHAIN.COMPUTE) return TASK_TYPE.COMPUTE;
  if (tt & TASK_TYPE_BOTCHAIN.BANDWIDTH) return TASK_TYPE.BANDWIDTH;

  return TASK_TYPE.INFERENCE;
}

/** Convert a canonical task type back to Botchain bit-flag encoding. */
export function toBotchainTaskType(canonicalType: number | string): number {
  switch (Number(canonicalType)) {
    case TASK_TYPE.INFERENCE: return TASK_TYPE_BOTCHAIN.INFERENCE;
    case TASK_TYPE.STORAGE: return TASK_TYPE_BOTCHAIN.STORAGE;
    case TASK_TYPE.COMPUTE: return TASK_TYPE_BOTCHAIN.COMPUTE;
    case TASK_TYPE.BANDWIDTH: return TASK_TYPE_BOTCHAIN.BANDWIDTH;
    default: return 0;
  }
}
