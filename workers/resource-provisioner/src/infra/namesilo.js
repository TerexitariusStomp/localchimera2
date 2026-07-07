import fetch from 'node-fetch';

const API_KEY = process.env.NAMESILO_API_KEY;
const API_URL = 'https://www.namesilo.com/api';

function namesiloParams(extra = {}) {
  return new URLSearchParams({
    version: '1',
    type: 'xml',
    key: API_KEY,
    ...extra,
  });
}

export async function checkDomainAvailability(domain) {
  if (!API_KEY) {
    console.warn('[namesilo] missing config; skipping domain check');
    return { skipped: true };
  }
  const params = namesiloParams({ domains: domain });
  const res = await fetch(`${API_URL}/checkRegisterAvailability?${params.toString()}`);
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Namesilo API error: ${body}`);
  }
  return { success: true, domain, available: body.includes('<available>yes</available>') };
}

export async function registerDomain(domain, years = 1, contactProfile = 'default') {
  if (!API_KEY) {
    console.warn('[namesilo] missing config; skipping domain registration');
    return { skipped: true };
  }
  const params = namesiloParams({
    domain,
    years: String(years),
    payment_id: '1',
    contact_id: contactProfile,
  });
  const res = await fetch(`${API_URL}/registerDomain?${params.toString()}`);
  const body = await res.text();
  if (!res.ok || body.includes('<code>')) {
    throw new Error(`Namesilo API error: ${body}`);
  }
  return { success: true, domain, years };
}

export async function addDnsRecord(domain, type, host, target, ttl = 3600) {
  if (!API_KEY) {
    console.warn('[namesilo] missing config; skipping DNS update');
    return { skipped: true };
  }
  const params = namesiloParams({
    domain,
    rrtype: type,
    rrdhost: host,
    rrdvalue: target,
    rrtTL: String(ttl),
  });
  const res = await fetch(`${API_URL}/dnsAddRecord?${params.toString()}`);
  const body = await res.text();
  if (!res.ok || body.includes('<code>')) {
    throw new Error(`Namesilo API error: ${body}`);
  }
  return { success: true, domain, host, target, type };
}

export async function createSubdomain(subdomain, target) {
  console.warn('[namesilo] createSubdomain is deprecated; use registerDomain or addDnsRecord');
  return { skipped: true };
}
