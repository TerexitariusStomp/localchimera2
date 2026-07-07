import { GolemNetwork } from '@golem-sdk/golem-js';
import { openTunnel } from '../infra/mysterium-tunnel.js';
import { addDnsRecord } from '../infra/namesilo.js';
import { pushToCDN } from '../infra/edge-network.js';
import { publishTelemetry } from '../infra/streamr.js';

const GOLEM_API_KEY = process.env.GOLEM_API_KEY || 'try_golem';
const GOLEM_PAYMENT_NETWORK = process.env.GOLEM_PAYMENT_NETWORK || 'polygon';

export async function provisionGolem({ quantity, recipient, deploymentId, domain, imageTag = 'golem/alpine:latest', code }) {
  const id = deploymentId || `golem-${Date.now()}`;
  console.log(`[golem] provisioning ${quantity} hours for ${recipient}`);

  // 1. Rent Golem provider and start activity.
  const glm = new GolemNetwork({
    api: { key: GOLEM_API_KEY },
    payment: { driver: 'erc20', network: GOLEM_PAYMENT_NETWORK },
  });

  await glm.connect();
  const order = {
    demand: {
      workload: { imageTag },
    },
    market: {
      rentHours: Number(quantity),
    },
  };
  const rental = await glm.oneOf({ order });
  const exeUnit = await rental.getExeUnit();
  await exeUnit.run('echo "chimera deployment ready"');

  let computeOutput = null;
  if (code) {
    try {
      const wrapped = code.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const result = await exeUnit.run(`sh -c "${wrapped}"`);
      computeOutput = result.stdout || result.toString?.() || '';
    } catch (e) {
      console.warn(`[golem] compute execution failed: ${e.message}`);
    }
  }

  // 2. Open Mysterium tunnel for ingress.
  const tunnel = await openTunnel({ deploymentId: id, targetHost: 'localhost:8080' });

  // 3. Configure DNS for the user-owned domain if provided.
  let dns;
  if (domain) {
    dns = await addDnsRecord(domain, 'CNAME', '@', tunnel.endpoint);
  }

  // 4. Push static assets to Edge Network CDN.
  const cdn = await pushToCDN({ path: `deployments/${id}/` });

  // 5. Publish deployment state to Streamr.
  await publishTelemetry({
    deploymentId: id,
    event: 'provisioned',
    quantity,
    state: {
      recipient,
      quantity,
      tunnel: tunnel.endpoint,
      domain,
      cdn: cdn?.url,
      rentalId: rental.id,
      status: 'provisioned',
    },
  });

  // 6. Return rental info. Note: caller is responsible for keeping rental alive
  //    or scheduling `rental.stopAndFinalize()` after the rental period.
  return {
    id,
    txHash: null,
    status: 'provisioned',
    tunnel: tunnel.endpoint,
    domain,
    cdn: cdn?.url,
    rentalId: rental.id,
    output: computeOutput,
  };
}
