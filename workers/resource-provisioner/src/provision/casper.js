export async function provisionCasper({ quantity, recipient }) {
  console.log(`[casper] provisioning ${quantity} hours for ${recipient}`);
  return { id: `casper-${Date.now()}`, txHash: null, status: 'provisioned' };
}
