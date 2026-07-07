import { getContact, saveContact } from '../../lib/store.js';
import { ok, badRequest, parseBody } from '../../lib/respond.js';

export async function onRequestPost(context) {
  const body = await parseBody(context.request);
  const { id, ...contact } = body;
  if (!id) return badRequest('id required');
  const saved = await saveContact(context.env, id, contact);
  return ok({ contact: saved });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return badRequest('id query param required');
  const contact = await getContact(context.env, id);
  if (!contact) return badRequest('Contact not found');
  return ok({ contact });
}
