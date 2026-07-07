import { nameSiloCall } from '../../lib/namesilo.js';
import { ok, badRequest, parseBody } from '../../lib/respond.js';

export async function onRequestPost(context) {
  const body = await parseBody(context.request);
  const { query } = body;
  if (!query) return badRequest('query required');
  const list = Array.isArray(query) ? query : [query];
  const result = await nameSiloCall(context.env, 'checkRegisterAvailability', {
    domains: list.join(','),
    paymentOption: 'auto',
  });
  if (result.success) return ok(result);
  return badRequest(result.error);
}
