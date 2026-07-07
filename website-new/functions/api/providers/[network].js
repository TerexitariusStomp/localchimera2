export const onRequest = async (context) => {
  const { request, params } = context;
  const network = params?.network;
  const allowed = ['akash', 'golem', 'mysterium', 'anyone', 'btfs', 'storj'];

  if (!allowed.includes(network)) {
    return new Response(JSON.stringify({ error: 'Unknown network' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    if (network === 'storj') {
      const [nodesRes, dataRes] = await Promise.all([
        fetch('https://stats.storjshare.io/nodes.json', { headers: { Accept: 'application/json' } }),
        fetch('https://stats.storjshare.io/data.json', { headers: { Accept: 'application/json' } }),
      ]);
      const nodes = nodesRes.ok ? await nodesRes.json() : {};
      const data = dataRes.ok ? await dataRes.json() : {};
      const satellites = Array.from(new Set([...Object.keys(nodes), ...Object.keys(data)]));
      const merged = satellites.map((satellite) => ({
        satellite,
        ...nodes[satellite],
        ...data[satellite],
      }));
      const body = JSON.stringify(merged);
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    const upstream = {
      akash: 'https://console-api.akash.network/v1/providers',
      golem: 'https://api2.stats.golem.network/v2/network/online',
      mysterium: 'https://discovery.mysterium.network/api/v4/proposals',
      anyone: 'https://api.ec.anyone.tech/relay-map',
      btfs: 'https://scan-backend.btfs.io/v1/storage_provider/list',
    }[network];

    const response = await fetch(upstream, {
      method: request.method,
      headers: { Accept: 'application/json' },
    });
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.delete('content-encoding');
    newHeaders.set('Cache-Control', 'public, max-age=300');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
};
