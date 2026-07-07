import { nameSiloCall } from '../../lib/namesilo.js';
import { ok, badRequest, parseBody } from '../../lib/respond.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const domain = url.searchParams.get('domain');
  if (!domain) return badRequest('domain query param required');
  const result = await nameSiloCall(context.env, 'dnsListRecords', { domain });
  if (result.success) return ok(result);
  return badRequest(result.error);
}

export async function onRequestPost(context) {
  const body = await parseBody(context.request);
  const { domain, record } = body;
  if (!domain || !record) return badRequest('domain and record required');
  const result = await nameSiloCall(context.env, 'dnsAddRecord', {
    domain,
    rrtype: record.type,
    rrhost: record.host,
    rrvalue: record.value,
    rrttl: record.ttl || 3600,
    rrdistance: record.distance || 0,
  });
  if (result.success) return ok(result);
  return badRequest(result.error);
}
