/**
 * PayoutRouter
 *
 * Tracks every app that integrates Chimera, their developers, fee structures,
 * users, wallet addresses, and completed orders.
 *
 * Monthly cycle:
 *   1. Record all orders throughout the month
 *   2. At month end, compute payout manifest
 *   3. Distribute: app developer fee + machine owner remainder
 */

import { PayoutStore } from './PayoutStore.js';
import { Logger } from '../core/Logger.js';

const logger = new Logger('PayoutRouter');

export class PayoutRouter {
  constructor() {
    this.store = new PayoutStore();
  }

  // ─── App Registration ───

  async registerApp({ appId, name, developerEVM, feePercent }) {
    if (!appId || !developerEVM) {
      return { success: false, error: 'appId and developerEVM required' };
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(developerEVM)) {
      return { success: false, error: 'developerEVM must be a valid EVM address' };
    }
    const fp = typeof feePercent === 'number' ? feePercent : 0.30;
    if (fp < 0 || fp > 1) {
      return { success: false, error: 'feePercent must be between 0 and 1' };
    }

    const apps = await this.store.getApps();
    apps[appId] = {
      appId,
      name: name || appId,
      developerEVM: developerEVM.toLowerCase(),
      feePercent: fp,
      registeredAt: Date.now(),
      userCount: 0,
      totalRevenue: 0
    };
    await this.store.saveApps();
    logger.info(`[payout] App registered: ${appId} (${name}) — dev: ${developerEVM}, fee: ${(fp * 100).toFixed(1)}%`);
    return { success: true, app: apps[appId] };
  }

  async getApps() {
    const apps = await this.store.getApps();
    return { success: true, apps: Object.values(apps) };
  }

  async getApp(appId) {
    const apps = await this.store.getApps();
    const app = apps[appId];
    if (!app) return { success: false, error: 'App not found' };
    return { success: true, app };
  }

  // ─── User Registration ───

  async registerUser({ userId, machineOwnerEVM, appId }) {
    if (!userId || !machineOwnerEVM || !appId) {
      return { success: false, error: 'userId, machineOwnerEVM, and appId required' };
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(machineOwnerEVM)) {
      return { success: false, error: 'machineOwnerEVM must be a valid EVM address' };
    }

    const apps = await this.store.getApps();
    if (!apps[appId]) {
      return { success: false, error: `App ${appId} not registered` };
    }

    const users = await this.store.getUsers();
    users[userId] = {
      userId,
      machineOwnerEVM: machineOwnerEVM.toLowerCase(),
      appId,
      registeredAt: Date.now(),
      totalOrders: 0,
      totalEarned: 0
    };
    apps[appId].userCount = (apps[appId].userCount || 0) + 1;
    await this.store.saveUsers();
    await this.store.saveApps();
    logger.info(`[payout] User registered: ${userId} → app: ${appId}, wallet: ${machineOwnerEVM}`);
    return { success: true, user: users[userId] };
  }

  async getUsers(appId) {
    const users = await this.store.getUsers();
    const list = Object.values(users);
    if (appId) return { success: true, users: list.filter(u => u.appId === appId) };
    return { success: true, users: list };
  }

  // ─── Order Recording ───

  async recordOrder({ orderId, userId, appId, miner, amount, metadata = {} }) {
    if (!orderId || !userId || !appId || !miner || typeof amount !== 'number') {
      return { success: false, error: 'orderId, userId, appId, miner, and amount required' };
    }
    if (amount <= 0) {
      return { success: false, error: 'amount must be positive' };
    }

    const apps = await this.store.getApps();
    const users = await this.store.getUsers();
    if (!apps[appId]) return { success: false, error: 'App not found' };
    if (!users[userId]) return { success: false, error: 'User not found' };

    const orders = await this.store.getOrders();
    const now = Date.now();
    orders[orderId] = {
      orderId,
      userId,
      appId,
      miner,
      amount,
      metadata,
      timestamp: now,
      year: new Date(now).getUTCFullYear(),
      month: new Date(now).getUTCMonth() + 1
    };

    // Update user + app aggregates
    users[userId].totalOrders = (users[userId].totalOrders || 0) + 1;
    users[userId].totalEarned = (users[userId].totalEarned || 0) + amount;
    apps[appId].totalRevenue = (apps[appId].totalRevenue || 0) + amount;

    await this.store.saveOrders();
    await this.store.saveUsers();
    await this.store.saveApps();
    logger.info(`[payout] Order recorded: ${orderId} — ${miner} — amount: ${amount.toFixed(6)}`);
    return { success: true, order: orders[orderId] };
  }

  async getOrders({ userId, appId, year, month } = {}) {
    const orders = await this.store.getOrders();
    let list = Object.values(orders);
    if (userId) list = list.filter(o => o.userId === userId);
    if (appId) list = list.filter(o => o.appId === appId);
    if (year) list = list.filter(o => o.year === year);
    if (month) list = list.filter(o => o.month === month);
    return { success: true, orders: list, total: list.reduce((s, o) => s + o.amount, 0) };
  }

  // ─── Monthly Payout Calculation ───

  async calculateMonthlyPayout(year, month) {
    const { orders } = await this.getOrders({ year, month });
    const apps = await this.store.getApps();
    const users = await this.store.getUsers();

    // Group orders by (appId, userId)
    const byUserApp = {};
    for (const o of orders) {
      const key = `${o.appId}:${o.userId}`;
      byUserApp[key] = byUserApp[key] || { appId: o.appId, userId: o.userId, amount: 0, orders: 0 };
      byUserApp[key].amount += o.amount;
      byUserApp[key].orders += 1;
    }

    const distributions = [];
    const appTotals = {};

    for (const key in byUserApp) {
      const entry = byUserApp[key];
      const app = apps[entry.appId];
      const user = users[entry.userId];
      if (!app || !user) continue;

      const feeRate = app.feePercent || 0.30;
      const devAmount = entry.amount * feeRate;
      const userAmount = entry.amount * (1 - feeRate);

      distributions.push({
        userId: entry.userId,
        appId: entry.appId,
        machineOwnerEVM: user.machineOwnerEVM,
        developerEVM: app.developerEVM,
        totalAmount: entry.amount,
        feeRate,
        devAmount,
        userAmount,
        orderCount: entry.orders
      });

      appTotals[entry.appId] = appTotals[entry.appId] || { appId: entry.appId, devTotal: 0, userTotal: 0, orderCount: 0 };
      appTotals[entry.appId].devTotal += devAmount;
      appTotals[entry.appId].userTotal += userAmount;
      appTotals[entry.appId].orderCount += entry.orders;
    }

    const manifest = {
      year,
      month,
      generatedAt: Date.now(),
      totalOrders: orders.length,
      totalRevenue: orders.reduce((s, o) => s + o.amount, 0),
      distributions,
      appSummaries: Object.values(appTotals)
    };

    const payouts = await this.store.getPayouts();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    payouts[key] = manifest;
    await this.store.savePayouts();

    logger.info(`[payout] Manifest ${key}: ${manifest.totalOrders} orders, ${manifest.totalRevenue.toFixed(6)} total`);
    return { success: true, manifest };
  }

  async getPayoutManifest(year, month) {
    const payouts = await this.store.getPayouts();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const manifest = payouts[key];
    if (!manifest) return { success: false, error: 'Manifest not found' };
    return { success: true, manifest };
  }

  // ─── Distribution ───

  async markDistributed(year, month, txHash) {
    const distributions = await this.store.getDistributions();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    distributions[key] = {
      year,
      month,
      distributedAt: Date.now(),
      txHash: txHash || null,
      status: txHash ? 'confirmed' : 'pending'
    };
    await this.store.saveDistributions();
    logger.info(`[payout] Distribution marked for ${key}: ${txHash || 'pending'}`);
    return { success: true, distribution: distributions[key] };
  }

  async getDistributionStatus(year, month) {
    const distributions = await this.store.getDistributions();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const d = distributions[key];
    if (!d) return { success: false, error: 'No distribution record' };
    return { success: true, distribution: d };
  }

  // ─── Summary Stats ───

  async getStats() {
    const apps = await this.store.getApps();
    const users = await this.store.getUsers();
    const orders = await this.store.getOrders();
    const appList = Object.values(apps);
    const orderList = Object.values(orders);
    return {
      success: true,
      stats: {
        appsRegistered: appList.length,
        usersRegistered: Object.values(users).length,
        totalOrders: orderList.length,
        totalRevenue: orderList.reduce((s, o) => s + o.amount, 0),
        apps: appList.map(a => ({
          appId: a.appId,
          name: a.name,
          developerEVM: a.developerEVM,
          feePercent: a.feePercent,
          userCount: a.userCount || 0,
          totalRevenue: a.totalRevenue || 0
        }))
      }
    };
  }
}
