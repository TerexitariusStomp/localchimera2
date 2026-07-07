const BTFS_API_URL = process.env.BTFS_API_URL || 'http://localhost:5001';

export async function provisionBtfs({ quantity, recipient, data }) {
  console.log(`[btfs] provisioning ${quantity} GB/month for ${recipient}`);

  let cid = null;
  if (data) {
    try {
      const form = new FormData();
      const blob = new Blob([data], { type: 'application/octet-stream' });
      form.append('file', blob, 'chimera-task.bin');
      const res = await fetch(`${BTFS_API_URL}/api/v0/add?pin=true`, {
        method: 'POST',
        body: form,
      });
      if (res.ok) {
        const json = await res.json();
        cid = json.Hash || json.Cid;
      } else {
        console.warn(`[btfs] add failed: ${res.status}`);
      }
    } catch (e) {
      console.warn(`[btfs] upload failed: ${e.message}`);
    }
  }

  return {
    id: `btfs-${Date.now()}`,
    txHash: null,
    status: 'provisioned',
    cid,
    apiUrl: BTFS_API_URL,
  };
}
