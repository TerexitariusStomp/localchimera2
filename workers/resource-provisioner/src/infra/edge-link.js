// Edge Network Link control-plane messaging stub.
// See docs/EDGE_NETWORK_EVENT_BUS.md for architecture analysis.
// In production, replace this with `@edge/link` clients and server.

export async function createLinkServer({ onMessage, onConnect }) {
  const clients = new Map();
  return {
    broadcast: (msg) => {
      for (const [id, client] of clients) {
        try {
          client.send(JSON.stringify(msg));
        } catch (err) {
          console.warn(`[edge-link] failed to send to ${id}:`, err.message);
        }
      }
    },
    send: (id, msg) => {
      const client = clients.get(id);
      if (client) client.send(JSON.stringify(msg));
    },
    // Stub helper for tests: register a fake client.
    _register: (id, client) => {
      clients.set(id, client);
      if (onConnect) onConnect(id);
    },
  };
}

export async function createLinkClient({ serverAddress, onMessage }) {
  return {
    send: (msg) => {
      console.log('[edge-link] client send:', msg);
    },
    connect: () => {
      console.log('[edge-link] client connected to', serverAddress);
    },
    disconnect: () => {
      console.log('[edge-link] client disconnected');
    },
  };
}
