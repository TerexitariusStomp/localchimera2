import { nameSiloCall } from '../../lib/namesilo.js';
import { ok, badRequest, parseBody } from '../../lib/respond.js';

export async function onRequestPost(context) {
  const body = await parseBody(context.request);
  const { domain, nameservers } = body;
  if (!domain || !Array.isArray(nameservers)) {
    return badRequest('domain and nameservers array required');
  }
  const params = { domain };
  nameservers.forEach((ns, i) => { params[`ns${i + 1}`] = ns; });
  const result = await nameSiloCall(context.env, 'changeNameServers', params);
  if (result.success) return ok(result);
  return badRequest(result.error);
}
