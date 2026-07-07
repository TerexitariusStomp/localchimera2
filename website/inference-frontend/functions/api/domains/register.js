import { nameSiloCall, requireContact, splitName } from '../../lib/namesilo.js';
import { getContact, saveOrder } from '../../lib/store.js';
import { ok, badRequest, parseBody } from '../../lib/respond.js';

export async function onRequestPost(context) {
  const body = await parseBody(context.request);
  const { userId, domain, years, contact, contactId, nameservers } = body;
  if (!domain) return badRequest('domain required');

  let contactData = contact;
  if (!contactData && contactId) {
    contactData = await getContact(context.env, contactId);
    if (!contactData) return badRequest('contact not found');
  }
  if (!contactData) return badRequest('contact required for NameSilo');

  const check = requireContact(contactData);
  if (!check.success) return badRequest(check.error);

  const { first, last } = splitName(contactData.name);
  const params = {
    domain,
    years: String(years || 1),
    private: '1',
    fn: first,
    ln: last,
    ad: contactData.address,
    cy: contactData.city,
    st: contactData.state,
    zp: contactData.postcode,
    ct: contactData.country,
    em: contactData.email,
    ph: contactData.phone,
  };
  if (contactData.organization) params.nickname = contactData.organization;
  if (nameservers?.dns1) params.ns1 = nameservers.dns1;
  if (nameservers?.dns2) params.ns2 = nameservers.dns2;

  const result = await nameSiloCall(context.env, 'registerDomain', params);
  if (result.success) {
    await saveOrder(context.env, {
      userId: userId || null,
      provider: 'namesilo',
      domain,
      years: years || 1,
      contact: contactData,
      registrarResult: result.result,
      cost: null,
      status: 'registered',
    });
    return ok(result);
  }
  return badRequest(result.error);
}
