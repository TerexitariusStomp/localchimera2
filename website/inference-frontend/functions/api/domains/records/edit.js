import { nameSiloCall } from '../../../lib/namesilo.js';
import { ok, badRequest, parseBody } from '../../../lib/respond.js';

export async function onRequestPost(context) {
  const body = await parseBody(context.request);
  const { domain, id, record } = body;
  if (!domain || !id) return badRequest('domain and id required');
  const result = await nameSiloCall(context.env, 'dnsUpdateRecord', {
    domain,
    rrid: id,
    rrtype: record?.type,
    rrhost: record?.host,
    rrvalue: record?.value,
    rrttl: record?.ttl || 3600,
    rrdistance: record?.distance || 0,
  });
  if (result.success) return ok(result);
  return badRequest(result.error);
}
