import { nameSiloCall } from '../../lib/namesilo.js';
import { ok, badRequest, serverError } from '../../lib/respond.js';

export async function onRequestGet(context) {
  try {
    const result = await nameSiloCall(context.env, 'getAccountBalance', {});
    if (result.success) return ok(result);
    return badRequest(result.error);
  } catch (e) {
    return serverError(`balance handler error: ${e.message || String(e)}`);
  }
}
