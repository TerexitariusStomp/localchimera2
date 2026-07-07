import { ok } from '../../lib/respond.js';

export async function onRequestGet() {
  return ok({
    providers: [
      {
        id: 'namesilo',
        name: 'NameSilo',
        anonymous: false,
        crypto: true,
        ownership: 'customer',
        note: 'Customer contact info is submitted to the registrar. Customer is the legal registrant. Bitcoin accepted.',
      },
    ],
  });
}
