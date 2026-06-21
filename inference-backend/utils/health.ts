import { createServer, IncomingMessage, ServerResponse } from 'http';
import { logger } from './logger.js';

export function startHealthServer(port: number): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'chimera-fortytwo-node' }));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, () => {
    logger.info({ port }, 'Health server listening');
  });
}
