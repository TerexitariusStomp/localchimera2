const PROXY_BASE = 'https://api.localchimera.com/api/namesilo';

export async function nameSiloCall(_env, operation, params = {}) {
  try {
    const query = new URLSearchParams({ ...params });
    const res = await fetch(`${PROXY_BASE}/${operation}?${query.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: `NameSilo proxy returned non-JSON: ${text.slice(0, 120)}` };
    }
    const reply = data?.reply;
    if (!reply || String(reply.code) !== '300') {
      return { success: false, error: reply?.detail || 'NameSilo API error', code: reply?.code };
    }
    return { success: true, result: reply };
  } catch (e) {
    return { success: false, error: `NameSilo proxy request failed: ${e.message || String(e)}` };
  }
}

export function requireContact(contact) {
  const required = ['name', 'email', 'phone', 'address', 'city', 'state', 'country', 'postcode'];
  for (const key of required) {
    if (!contact[key]) return { success: false, error: `${key} is required` };
  }
  return { success: true };
}

export function splitName(name) {
  const parts = (name || '').trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || parts[0] || '' };
}
