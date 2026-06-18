/**
 * PayoutStore — JSON file persistence for payout router data.
 * Stores apps, users, orders, and monthly payout manifests.
 */

import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'payouts');

const FILES = {
  apps: path.join(DATA_DIR, 'apps.json'),
  users: path.join(DATA_DIR, 'users.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  payouts: path.join(DATA_DIR, 'payouts.json'),
  distributions: path.join(DATA_DIR, 'distributions.json')
};

export class PayoutStore {
  constructor() {
    this._cache = {};
  }

  async _ensureDir() {
    try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch (_) {}
  }

  async _load(key) {
    if (this._cache[key]) return this._cache[key];
    await this._ensureDir();
    try {
      const raw = await fs.readFile(FILES[key], 'utf-8');
      this._cache[key] = JSON.parse(raw);
    } catch (e) {
      this._cache[key] = {};
    }
    return this._cache[key];
  }

  async _save(key) {
    await this._ensureDir();
    const data = this._cache[key] || {};
    await fs.writeFile(FILES[key], JSON.stringify(data, null, 2), 'utf-8');
  }

  async getApps() { return this._load('apps'); }
  async getUsers() { return this._load('users'); }
  async getOrders() { return this._load('orders'); }
  async getPayouts() { return this._load('payouts'); }
  async getDistributions() { return this._load('distributions'); }

  async saveApps() { return this._save('apps'); }
  async saveUsers() { return this._save('users'); }
  async saveOrders() { return this._save('orders'); }
  async savePayouts() { return this._save('payouts'); }
  async saveDistributions() { return this._save('distributions'); }
}
