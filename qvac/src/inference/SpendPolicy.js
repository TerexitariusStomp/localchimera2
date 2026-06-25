import { Logger } from '../core/Logger.js';

/**
 * SpendPolicy — per-call and session-level budget enforcement.
 *
 * Inspired by Conduit's SpendPolicy: before each paid inference, check
 * against per-call cap and session budget. If declined, the buyer keeps
 * the free local draft (from ConfidenceRouter).
 *
 * Policy levels:
 *   - perCallCap: max USDT per single inference
 *   - sessionBudget: max USDT per session (resets on new session)
 *   - dailyBudget: max USDT per day
 *   - monthlyBudget: max USDT per month
 *
 * Integration: TokenMeter calls SpendPolicy.beforeCharge() before deducting.
 * If declined, inference is aborted and the local draft is returned.
 */

export class SpendPolicy {
  constructor(config = {}) {
    this.logger = new Logger('SpendPolicy');
    this.enabled = config.enabled !== false;
    this.perCallCap = config.perCallCap || 0.01; // max USDT per inference
    this.sessionBudget = config.sessionBudget || 1.0; // max USDT per session
    this.dailyBudget = config.dailyBudget || 10.0;
    this.monthlyBudget = config.monthlyBudget || 100.0;

    this._sessions = new Map(); // sessionId -> { spent, startedAt, calls }
    this._dailyTotals = new Map(); // 'YYYY-MM-DD' -> { spent, calls }
    this._monthlyTotals = new Map(); // 'YYYY-MM' -> { spent, calls }
    this._currentSession = null;
    this._stats = {
      totalApproved: 0,
      totalDeclined: 0,
      totalSpent: 0,
      declineReasons: {},
    };
  }

  /**
   * Start a new session.
   */
  startSession(sessionId = null) {
    const id = sessionId || `session-${Date.now()}`;
    this._sessions.set(id, {
      sessionId: id,
      spent: 0,
      startedAt: Date.now(),
      calls: 0,
    });
    this._currentSession = id;
    this.logger.info(`Session started: ${id}`);
    return id;
  }

  /**
   * End a session.
   */
  endSession(sessionId = null) {
    const id = sessionId || this._currentSession;
    if (id) {
      const session = this._sessions.get(id);
      if (session) {
        this.logger.info(`Session ended: ${id} (spent: ${session.spent.toFixed(4)} USDT, calls: ${session.calls})`);
      }
      this._sessions.delete(id);
      if (this._currentSession === id) this._currentSession = null;
    }
  }

  /**
   * Check if a charge is allowed under the current policy.
   * @param {number} amount - USDT amount to charge
   * @param {object} options - { sessionId, perCallOverride }
   * @returns { approved, reason, remainingSession, remainingDaily }
   */
  beforeCharge(amount, options = {}) {
    if (!this.enabled) return { approved: true, reason: 'disabled' };

    const sessionId = options.sessionId || this._currentSession;
    const perCallCap = options.perCallOverride || this.perCallCap;

    // Per-call cap
    if (amount > perCallCap) {
      this._recordDecline('per_call_cap');
      this.logger.warn(`Charge declined: ${amount.toFixed(4)} > per-call cap ${perCallCap}`);
      return { approved: false, reason: 'per_call_cap', amount, cap: perCallCap };
    }

    // Session budget
    if (sessionId) {
      const session = this._sessions.get(sessionId);
      if (session) {
        const remainingSession = this.sessionBudget - session.spent;
        if (amount > remainingSession) {
          this._recordDecline('session_budget');
          this.logger.warn(`Charge declined: session budget exceeded (${session.spent.toFixed(4)}/${this.sessionBudget})`);
          return { approved: false, reason: 'session_budget', remainingSession: Math.max(0, remainingSession) };
        }
      }
    }

    // Daily budget
    const today = this._dateKey();
    const daily = this._dailyTotals.get(today) || { spent: 0, calls: 0 };
    const remainingDaily = this.dailyBudget - daily.spent;
    if (amount > remainingDaily) {
      this._recordDecline('daily_budget');
      this.logger.warn(`Charge declined: daily budget exceeded (${daily.spent.toFixed(4)}/${this.dailyBudget})`);
      return { approved: false, reason: 'daily_budget', remainingDaily: Math.max(0, remainingDaily) };
    }

    // Monthly budget
    const month = this._monthKey();
    const monthly = this._monthlyTotals.get(month) || { spent: 0, calls: 0 };
    const remainingMonthly = this.monthlyBudget - monthly.spent;
    if (amount > remainingMonthly) {
      this._recordDecline('monthly_budget');
      this.logger.warn(`Charge declined: monthly budget exceeded (${monthly.spent.toFixed(4)}/${this.monthlyBudget})`);
      return { approved: false, reason: 'monthly_budget', remainingMonthly: Math.max(0, remainingMonthly) };
    }

    this._stats.totalApproved++;
    return {
      approved: true,
      remainingSession: sessionId ? this.sessionBudget - (this._sessions.get(sessionId)?.spent || 0) : this.sessionBudget,
      remainingDaily: Math.max(0, remainingDaily),
      remainingMonthly: Math.max(0, remainingMonthly),
    };
  }

  /**
   * Record a successful charge.
   */
  recordCharge(amount, sessionId = null) {
    if (!this.enabled) return;
    const sid = sessionId || this._currentSession;

    if (sid) {
      const session = this._sessions.get(sid);
      if (session) {
        session.spent += amount;
        session.calls++;
      }
    }

    const today = this._dateKey();
    const daily = this._dailyTotals.get(today) || { spent: 0, calls: 0 };
    daily.spent += amount;
    daily.calls++;
    this._dailyTotals.set(today, daily);

    const month = this._monthKey();
    const monthly = this._monthlyTotals.get(month) || { spent: 0, calls: 0 };
    monthly.spent += amount;
    monthly.calls++;
    this._monthlyTotals.set(month, monthly);

    this._stats.totalSpent += amount;
  }

  /**
   * Get current session status.
   */
  getSessionStatus(sessionId = null) {
    const sid = sessionId || this._currentSession;
    if (!sid) return null;
    const session = this._sessions.get(sid);
    if (!session) return null;
    return {
      sessionId: sid,
      spent: Math.round(session.spent * 10000) / 10000,
      budget: this.sessionBudget,
      remaining: Math.round((this.sessionBudget - session.spent) * 10000) / 10000,
      calls: session.calls,
      startedAt: session.startedAt,
      duration: Date.now() - session.startedAt,
    };
  }

  /**
   * Get budget status for all levels.
   */
  getBudgetStatus() {
    const today = this._dateKey();
    const month = this._monthKey();
    const daily = this._dailyTotals.get(today) || { spent: 0, calls: 0 };
    const monthly = this._monthlyTotals.get(month) || { spent: 0, calls: 0 };
    return {
      perCallCap: this.perCallCap,
      sessionBudget: this.sessionBudget,
      dailyBudget: this.dailyBudget,
      monthlyBudget: this.monthlyBudget,
      dailySpent: Math.round(daily.spent * 10000) / 10000,
      dailyCalls: daily.calls,
      monthlySpent: Math.round(monthly.spent * 10000) / 10000,
      monthlyCalls: monthly.calls,
      activeSessions: this._sessions.size,
    };
  }

  _recordDecline(reason) {
    this._stats.totalDeclined++;
    this._stats.declineReasons[reason] = (this._stats.declineReasons[reason] || 0) + 1;
  }

  _dateKey() {
    return new Date().toISOString().slice(0, 10);
  }

  _monthKey() {
    return new Date().toISOString().slice(0, 7);
  }

  getStats() {
    return {
      enabled: this.enabled,
      ...this.getBudgetStatus(),
      totalApproved: this._stats.totalApproved,
      totalDeclined: this._stats.totalDeclined,
      totalSpent: Math.round(this._stats.totalSpent * 10000) / 10000,
      declineReasons: this._stats.declineReasons,
    };
  }
}
