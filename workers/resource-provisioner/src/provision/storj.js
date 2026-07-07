import { execSync } from 'child_process';

const STORJ_BUCKET = process.env.STORJ_BUCKET || 'chimera-fallback';
const STORJ_GATEWAY_URL = process.env.STORJ_GATEWAY_URL || 'https://gateway.storjshare.io';
const STORJ_UPLINK_BINARY = process.env.STORJ_UPLINK_BINARY || 'uplink';

function uplinkAvailable() {
  try {
    execSync(`${STORJ_UPLINK_BINARY} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function provisionStorj({ quantity, recipient, data }) {
  console.log(`[storj] provisioning ${quantity} GB/month for ${recipient}`);

  let objectKey = null;

  if (data && uplinkAvailable()) {
    try {
      objectKey = `chimera-${Date.now()}.bin`;
      try {
        execSync(`${STORJ_UPLINK_BINARY} mb ${STORJ_BUCKET}`, { stdio: 'ignore' });
      } catch {
        // bucket may already exist
      }
      const buffer = Buffer.from(data, 'utf8');
      execSync(`${STORJ_UPLINK_BINARY} put ${STORJ_BUCKET}/${objectKey}`, {
        input: buffer,
        stdio: ['pipe', 'ignore', 'ignore'],
      });
    } catch (e) {
      console.warn(`[storj] uplink upload failed: ${e.message}`);
      objectKey = null;
    }
  }

  return {
    id: `storj-${Date.now()}`,
    txHash: null,
    status: 'provisioned',
    bucket: STORJ_BUCKET,
    objectKey,
    sizeGb: quantity || 1,
    recipient,
    apiUrl: STORJ_GATEWAY_URL,
  };
}
