import { provisionGolem } from './golem.js';
import { provisionAkash } from './akash.js';
import { provisionBtfs } from './btfs.js';
import { provisionStorj } from './storj.js';
import { provisionMysterium } from './mysterium.js';
import { provisionAnyone } from './anyone.js';
import { provisionBttAi } from './btt-ai.js';
import { provisionCasper } from './casper.js';

const provisioners = {
  'golem-compute': provisionGolem,
  'golem-deployment-alpine': provisionGolem,
  'golem-deployment-nginx': provisionGolem,
  'akash-compute': provisionAkash,
  'akash-inference': provisionAkash,
  'btfs-storage': provisionBtfs,
  'storj-storage': provisionStorj,
  'mysterium-bandwidth': provisionMysterium,
  'anyone-bandwidth': provisionAnyone,
  'btt-ai-inference': provisionBttAi,
  'casper-compute': provisionCasper,
};

export async function provisionResource(resourceType, params) {
  const provisioner = provisioners[resourceType];
  if (!provisioner) {
    throw new Error(`No provisioner for resource type: ${resourceType}`);
  }
  return provisioner(params);
}
