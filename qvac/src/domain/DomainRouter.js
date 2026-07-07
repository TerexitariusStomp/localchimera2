import { Logger } from '../core/Logger.js';
import { DomainStore } from './DomainStore.js';

const logger = new Logger('DomainRouter');

export class DomainRouter {
  constructor(config = {}) {
    this.config = config;
    this.store = new DomainStore(config.dataDir);
    this.nameSiloKey = process.env.NAMESILO_KEY || config.nameSiloKey || '';
  }

  /* ─── Common helpers ─── */

  async _nameSiloCall(operation, params = {}) {
    if (!this.nameSiloKey) {
      return { success: false, error: 'NAMESILO_KEY not configured' };
    }
    const query = new URLSearchParams({ version: '1', type: 'json', key: this.nameSiloKey, ...params });
    try {
      const res = await fetch(`https://www.namesilo.com/api/${operation}?${query.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      const data = await res.json();
      const reply = data?.reply;
      if (!reply || reply.code !== '300') {
        return { success: false, error: reply?.detail || 'NameSilo API error', code: reply?.code };
      }
      return { success: true, result: reply };
    } catch (e) {
      logger.error(`[namesilo] ${operation} failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  _requireContact(contact) {
    const required = ['name', 'email', 'phone', 'address', 'city', 'state', 'country', 'postcode'];
    for (const key of required) {
      if (!contact[key]) return { success: false, error: `${key} is required` };
    }
    return { success: true };
  }

  /* ─── NameSilo: ICANN-accredited, Bitcoin, customer ownership ─── */

  _nameSiloSplitName(name) {
    const parts = (name || '').trim().split(/\s+/);
    return { first: parts[0] || '', last: parts.slice(1).join(' ') || parts[0] || '' };
  }

  async nameSiloCheck(domains) {
    const list = Array.isArray(domains) ? domains : [domains];
    return this._nameSiloCall('checkRegisterAvailability', { domains: list.join(','), paymentOption: 'auto' });
  }

  async nameSiloAddContact(contact) {
    const check = this._requireContact(contact);
    if (!check.success) return check;
    const { first, last } = this._nameSiloSplitName(contact.name);
    const params = {
      fn: first,
      ln: last,
      ad: contact.address,
      cy: contact.city,
      st: contact.state,
      zp: contact.postcode,
      ct: contact.country,
      em: contact.email,
      ph: contact.phone,
    };
    if (contact.organization) params.nickname = contact.organization;
    return this._nameSiloCall('contactAdd', params);
  }

  async nameSiloRegister(domain, years, contact, nameservers = {}) {
    const check = this._requireContact(contact);
    if (!check.success) return check;
    const { first, last } = this._nameSiloSplitName(contact.name);
    const params = {
      domain,
      years: String(years || 1),
      private: '1',
      fn: first,
      ln: last,
      ad: contact.address,
      cy: contact.city,
      st: contact.state,
      zp: contact.postcode,
      ct: contact.country,
      em: contact.email,
      ph: contact.phone,
    };
    if (contact.organization) params.nickname = contact.organization;
    if (nameservers.dns1) params.ns1 = nameservers.dns1;
    if (nameservers.dns2) params.ns2 = nameservers.dns2;
    return this._nameSiloCall('registerDomain', params);
  }

  async nameSiloRenew(domain, years) {
    return this._nameSiloCall('renewDomain', { domain, years: String(years || 1) });
  }

  async nameSiloInfo(domain) {
    return this._nameSiloCall('getDomainInfo', { domain });
  }

  async nameSiloUpdateNameservers(domain, nameservers) {
    const params = { domain };
    nameservers.forEach((ns, i) => { params[`ns${i + 1}`] = ns; });
    return this._nameSiloCall('changeNameServers', params);
  }

  async nameSiloListRecords(domain) {
    return this._nameSiloCall('dnsListRecords', { domain });
  }

  async nameSiloAddRecord(domain, record) {
    return this._nameSiloCall('dnsAddRecord', { domain, rrtype: record.type, rrhost: record.host, rrvalue: record.value, rrttl: record.ttl || 3600, rrdistance: record.distance || 0 });
  }

  async nameSiloEditRecord(domain, id, record) {
    return this._nameSiloCall('dnsUpdateRecord', { domain, rrid: id, rrtype: record.type, rrhost: record.host, rrvalue: record.value, rrttl: record.ttl || 3600, rrdistance: record.distance || 0 });
  }

  async nameSiloRemoveRecord(domain, id) {
    return this._nameSiloCall('dnsDeleteRecord', { domain, rrid: id });
  }

  async nameSiloBalance() {
    return this._nameSiloCall('getAccountBalance', {});
  }

  /* ─── Order recording ─── */

  async recordOrder({ userId, provider, domain, years, contact, registrarResult, cost, status }) {
    const order = {
      userId,
      provider,
      domain,
      years,
      contact,
      registrarResult,
      cost,
      status,
    };
    const saved = await this.store.recordOrder(order);
    logger.info(`[domain] Order recorded: ${userId || 'unknown'} → ${provider}/${domain} — ${status}`);
    return { success: true, order: saved };
  }

  async getOrders(userId) {
    const orders = await this.store.getOrders();
    let list = Object.values(orders);
    if (userId) list = list.filter(o => o.userId === userId);
    return { success: true, orders: list.sort((a, b) => b.createdAt - a.createdAt) };
  }

  async saveContact(id, contact) {
    const saved = await this.store.saveContact(id, contact);
    return { success: true, contact: saved };
  }

  async getContact(id) {
    const contact = await this.store.getContact(id);
    return contact ? { success: true, contact } : { success: false, error: 'Contact not found' };
  }
}
