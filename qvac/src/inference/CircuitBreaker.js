import { Logger } from '../core/Logger.js';

/**
 * CircuitBreaker — protects inference routing from repeat failures.
 *
 * Inspired by daemon-hive-swarm: if a device/peer/miner fails N times
 * consecutively, the circuit "trips" and stops routing to it for a
 * cooldown period. After cooldown, a half-open probe is sent; if it
 * succeeds, the circuit resets. If it fails, the cooldown restarts.
 *
 * States:
 *   CLOSED    — normal operation, requests flow through
 *   OPEN      — circuit tripped, requests are rejected immediately
 *   HALF_OPEN — cooldown elapsed, one probe request allowed
 *
 * This prevents cascading failures and gives flaky peers time to recover.
 */

const STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
};

export class CircuitBreaker {
  constructor(config = {}) {
    this.logger = new Logger('CircuitBreaker');
    this.failureThreshold = config.failureThreshold || 3;
    this.cooldownMs = config.cooldownMs || 60000; // 1 minute
    this.halfOpenMaxCalls = config.halfOpenMaxCalls || 1;
    this._circuits = new Map();
    this.enabled = config.enabled !== false;
  }

  /**
   * Get or create a circuit for a target (peerId, minerName, deviceId).
   */
  _getOrCreate(targetId) {
    if (!this._circuits.has(targetId)) {
      this._circuits.set(targetId, {
        targetId,
        state: STATES.CLOSED,
        consecutiveFailures: 0,
        lastFailureTime: null,
        openedAt: null,
        halfOpenCalls: 0,
        totalTrips: 0,
        totalRejected: 0,
      });
    }
    return this._circuits.get(targetId);
  }

  /**
   * Check if a request to the target is allowed.
   * Returns { allowed, state, reason }.
   */
  canRequest(targetId) {
    if (!this.enabled) return { allowed: true, state: STATES.CLOSED };

    const circuit = this._getOrCreate(targetId);

    switch (circuit.state) {
      case STATES.CLOSED:
        return { allowed: true, state: circuit.state };

      case STATES.OPEN: {
        // Check if cooldown has elapsed
        const elapsed = Date.now() - circuit.openedAt;
        if (elapsed >= this.cooldownMs) {
          circuit.state = STATES.HALF_OPEN;
          circuit.halfOpenCalls = 0;
          this.logger.info(`Circuit ${targetId} → HALF_OPEN (probe allowed)`);
          return { allowed: true, state: circuit.state, reason: 'half-open probe' };
        }
        circuit.totalRejected++;
        return {
          allowed: false,
          state: circuit.state,
          reason: `Circuit open (${Math.round((this.cooldownMs - elapsed) / 1000)}s remaining)`,
        };
      }

      case STATES.HALF_OPEN: {
        if (circuit.halfOpenCalls < this.halfOpenMaxCalls) {
          circuit.halfOpenCalls++;
          return { allowed: true, state: circuit.state, reason: 'half-open probe' };
        }
        circuit.totalRejected++;
        return { allowed: false, state: circuit.state, reason: 'Half-open probe in flight' };
      }

      default:
        return { allowed: true, state: circuit.state };
    }
  }

  /**
   * Record a successful request to the target.
   * Resets the circuit to CLOSED.
   */
  recordSuccess(targetId) {
    if (!this.enabled) return;
    const circuit = this._getOrCreate(targetId);
    if (circuit.state !== STATES.CLOSED) {
      this.logger.info(`Circuit ${targetId} → CLOSED (recovered)`);
    }
    circuit.state = STATES.CLOSED;
    circuit.consecutiveFailures = 0;
    circuit.halfOpenCalls = 0;
  }

  /**
   * Record a failed request to the target.
   * Increments failure count; trips circuit if threshold reached.
   */
  recordFailure(targetId, reason = '') {
    if (!this.enabled) return;
    const circuit = this._getOrCreate(targetId);
    circuit.consecutiveFailures++;
    circuit.lastFailureTime = Date.now();

    if (circuit.state === STATES.HALF_OPEN) {
      // Probe failed — back to OPEN
      this._trip(circuit, targetId, `half-open probe failed: ${reason}`);
      return;
    }

    if (circuit.consecutiveFailures >= this.failureThreshold) {
      this._trip(circuit, targetId, `${circuit.consecutiveFailures} consecutive failures: ${reason}`);
    }
  }

  _trip(circuit, targetId, reason) {
    circuit.state = STATES.OPEN;
    circuit.openedAt = Date.now();
    circuit.totalTrips++;
    this.logger.warn(`Circuit ${targetId} → OPEN (${reason}, cooldown: ${this.cooldownMs / 1000}s)`);
  }

  /**
   * Manually reset a circuit (e.g., after maintenance).
   */
  reset(targetId) {
    const circuit = this._circuits.get(targetId);
    if (circuit) {
      circuit.state = STATES.CLOSED;
      circuit.consecutiveFailures = 0;
      circuit.halfOpenCalls = 0;
      this.logger.info(`Circuit ${targetId} manually reset → CLOSED`);
    }
  }

  /**
   * Reset all circuits.
   */
  resetAll() {
    for (const circuit of this._circuits.values()) {
      circuit.state = STATES.CLOSED;
      circuit.consecutiveFailures = 0;
      circuit.halfOpenCalls = 0;
    }
    this.logger.info('All circuits reset → CLOSED');
  }

  getCircuit(targetId) {
    return this._circuits.get(targetId) || null;
  }

  getAllCircuits() {
    return Array.from(this._circuits.values());
  }

  getStatus() {
    const circuits = Array.from(this._circuits.values());
    return {
      enabled: this.enabled,
      totalCircuits: circuits.length,
      closed: circuits.filter(c => c.state === STATES.CLOSED).length,
      open: circuits.filter(c => c.state === STATES.OPEN).length,
      halfOpen: circuits.filter(c => c.state === STATES.HALF_OPEN).length,
      totalTrips: circuits.reduce((s, c) => s + c.totalTrips, 0),
      totalRejected: circuits.reduce((s, c) => s + c.totalRejected, 0),
      failureThreshold: this.failureThreshold,
      cooldownMs: this.cooldownMs,
    };
  }
}

export { STATES as CIRCUIT_STATES };
