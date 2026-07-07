import { nameSiloCall } from '../../../lib/namesilo.js';
import { ok, badRequest, parseBody } from '../../../lib/respond.js';

export async function onRequestPost(context) {
  const body = await parseBody(context.request);
  const { domain, id } = body;
  if (!domain || !id) return badRequest('domain and id required');
  const result = await nameSiloCall(context.env, 'dnsDeleteRecord', { domain, rrid: id });
  if (result.success) return ok(result);
  return badRequest(result.error);
}
