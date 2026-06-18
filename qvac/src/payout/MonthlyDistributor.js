/**
 * MonthlyDistributor
 * Scheduled job that runs monthly to compute payout manifests
 * and prepare distribution transactions.
 *
 * In production, this triggers the actual EVM multisig distribution.
 * For now it produces a distribution manifest that can be executed.
 */

import { PayoutRouter } from './PayoutRouter.js';
import { Logger } from '../core/Logger.js';

const logger = new Logger('MonthlyDistributor');

export class MonthlyDistributor {
  constructor(payoutRouter = null) {
    this.payoutRouter = payoutRouter || new PayoutRouter();
    this.intervalMs = 60 * 60 * 1000; // check every hour
    this.timer = null;
  }

  start() {
    logger.info('MonthlyDistributor started — checking every hour');
    this.check(); // immediate check
    this.timer = setInterval(() => this.check(), this.intervalMs);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    logger.info('MonthlyDistributor stopped');
  }

  async check() {
    const now = new Date();
    const isFirstOfMonth = now.getUTCDate() === 1;
    const isMidnight = now.getUTCHours() === 0;
    if (!isFirstOfMonth || !isMidnight) return;

    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1; // current month = 1-based
    // We calculate the PREVIOUS month's payouts on the 1st
    const targetMonth = month === 1 ? 12 : month - 1;
    const targetYear = month === 1 ? year - 1 : year;

    logger.info(`[monthly] Running distribution for ${targetYear}-${String(targetMonth).padStart(2, '0')}`);

    try {
      const result = await this.payoutRouter.calculateMonthlyPayout(targetYear, targetMonth);
      if (!result.success) {
        logger.error(`[monthly] Calculation failed: ${result.error}`);
        return;
      }

      const manifest = result.manifest;
      logger.info(`[monthly] Manifest: ${manifest.totalOrders} orders, ${manifest.totalRevenue.toFixed(6)} total`);

      // Build distribution summary by wallet address
      const byWallet = {};
      for (const d of manifest.distributions) {
        const devKey = d.developerEVM;
        const userKey = d.machineOwnerEVM;
        byWallet[devKey] = (byWallet[devKey] || 0) + d.devAmount;
        byWallet[userKey] = (byWallet[userKey] || 0) + d.userAmount;
      }

      const distributionPlan = Object.entries(byWallet).map(([address, amount]) => ({
        address,
        amount: parseFloat(amount.toFixed(6))
      })).filter(x => x.amount > 0);

      logger.info(`[monthly] Distribution plan: ${distributionPlan.length} recipients`);
      for (const entry of distributionPlan) {
        logger.info(`[monthly]   → ${entry.address}: ${entry.amount.toFixed(6)}`);
      }

      // Write distribution plan to file for admin review / execution
      const { promises: fs } = await import('fs');
      const path = await import('path');
      const dir = path.default.join(process.cwd(), 'data', 'payouts');
      await fs.mkdir(dir, { recursive: true });
      const file = path.default.join(dir, `distribution-${targetYear}-${String(targetMonth).padStart(2, '0')}.json`);
      await fs.writeFile(file, JSON.stringify({
        year: targetYear,
        month: targetMonth,
        generatedAt: Date.now(),
        totalRevenue: manifest.totalRevenue,
        totalRecipients: distributionPlan.length,
        recipients: distributionPlan
      }, null, 2), 'utf-8');

      // Mark as pending distribution
      await this.payoutRouter.markDistributed(targetYear, targetMonth, null);
      logger.info(`[monthly] Distribution plan saved to ${file}`);

    } catch (err) {
      logger.error(`[monthly] Error: ${err.message}`);
    }
  }
}
