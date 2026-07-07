import { nameSiloCall } from '../../lib/namesilo.js';
import { ok, badRequest, parseBody } from '../../lib/respond.js';

export async function onRequestPost(context) {
  const body = await parseBody(context.request);
  const { domain, years } = body;
  if (!domain) return badRequest('domain required');
  const result = await nameSiloCall(context.env, 'renewDomain', {
    domain,
    years: String(years || 1),
  });
  if (result.success) return ok(result);
  return badRequest(result.error);
}
