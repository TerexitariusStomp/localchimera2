import { promises as fs } from 'fs';
import path from 'path';

export class DomainStore {
  constructor(dataDir = path.join(process.cwd(), 'data', 'domains')) {
    this.dataDir = dataDir;
    this._files = {
      orders: path.join(dataDir, 'orders.json'),
      contacts: path.join(dataDir, 'contacts.json'),
      credentials: path.join(dataDir, 'credentials.json'),
    };
    this._cache = {};
  }

  async _ensureDir() {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async _load(key) {
    if (this._cache[key]) return this._cache[key];
    await this._ensureDir();
    try {
      this._cache[key] = JSON.parse(await fs.readFile(this._files[key], 'utf-8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      this._cache[key] = {};
    }
    return this._cache[key];
  }

  async _save(key) {
    await this._ensureDir();
    await fs.writeFile(this._files[key], JSON.stringify(this._cache[key] || {}, null, 2), 'utf-8');
  }

  async getOrders() { return this._load('orders'); }
  async getContacts() { return this._load('contacts'); }
  async getCredentials() { return this._load('credentials'); }

  async saveOrders() { return this._save('orders'); }
  async saveContacts() { return this._save('contacts'); }
  async saveCredentials() { return this._save('credentials'); }

  async recordOrder(order) {
    const orders = await this.getOrders();
    const id = order.id || `dom-${Date.now()}`;
    orders[id] = { ...order, id, createdAt: Date.now(), userId: order.userId || null };
    await this.saveOrders();
    return orders[id];
  }

  async getOrder(id) {
    const orders = await this.getOrders();
    return orders[id] || null;
  }

  async saveContact(id, contact) {
    const contacts = await this.getContacts();
    contacts[id] = { ...contact, id, updatedAt: Date.now() };
    await this.saveContacts();
    return contacts[id];
  }

  async getContact(id) {
    const contacts = await this.getContacts();
    return contacts[id] || null;
  }

  async saveCredentials(provider, creds) {
    const credentials = await this.getCredentials();
    credentials[provider] = { ...creds, updatedAt: Date.now() };
    await this.saveCredentials();
    return credentials[provider];
  }
}
