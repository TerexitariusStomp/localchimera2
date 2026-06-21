/**
 * Auth & Health HTTP integration tests.
 *
 * Spins up a real WebServer with a real AuthService, sends actual HTTP
 * requests, and verifies end-to-end behavior. No mocks.
 *
 * Run: node --test test/auth.test.js
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { WebServer } from '../src/web/server.js';
import { AuthService } from '../src/auth/AuthService.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function req(port, method, pathname, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'close',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...extraHeaders,
      },
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ── Suite ───────────────────────────────────────────────────────────────────────

describe('Auth & Health — HTTP integration', () => {
  let server, httpServer, port, tmpDir, authService;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-auth-'));
    server = new WebServer({ multisig: { rpcUrl: 'https://arb1.arbitrum.io/rpc' } });
    await server.initialize();

    // Wire up a real AuthService manually (normally done by NodeManager)
    authService = new AuthService({});
    await authService.initialize();
    server.nodeManager = { authService }; // mock just the authService property

    httpServer = http.createServer((req, res) => server.handleRequest(req, res));
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', () => { port = httpServer.address().port; resolve(); }));
  });

  after(async () => {
    server.orchestrator.stop();
    httpServer.closeAllConnections?.();
    await new Promise(resolve => httpServer.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true });
    // Clean up auth files so they don't leak across test runs
    try { await fs.rm(path.join(process.cwd(), 'data', 'auth.json')); } catch {}
    try { await fs.rm(path.join(process.cwd(), 'data', 'auth-store.json')); } catch {}
  });

  // ── Health ────────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns status ok and uptime', async () => {
      const r = await req(port, 'GET', '/health');
      assert.equal(r.status, 200);
      assert.equal(r.body.status, 'ok');
      assert.ok(typeof r.body.uptime === 'number');
      assert.ok(r.body.uptime >= 0);
    });
  });

  // ── Sign-in ───────────────────────────────────────────────────────────────────

  describe('POST /api/signin', () => {
    it('rejects missing email', async () => {
      const r = await req(port, 'POST', '/api/signin', { password: 'secret' });
      assert.equal(r.status, 400);
      assert.ok(r.body.error.includes('Email'));
    });

    it('rejects invalid email format', async () => {
      const r = await req(port, 'POST', '/api/signin', { email: 'not-an-email', password: 'secret' });
      assert.equal(r.status, 400);
      assert.ok(r.body.error.includes('Invalid email'));
    });

    it('rejects missing password', async () => {
      const r = await req(port, 'POST', '/api/signin', { email: 'test@example.com' });
      assert.equal(r.status, 400);
      assert.ok(r.body.error.includes('Password'));
    });

    it('creates account on first sign-in and returns token', async () => {
      const r = await req(port, 'POST', '/api/signin', { email: 'alice@node.local', password: 'node-pass-123' });
      assert.equal(r.status, 200);
      assert.ok(r.body.token);
      assert.equal(typeof r.body.token, 'string');
      assert.ok(r.body.token.length > 20);
      assert.equal(r.body.email, 'alice@node.local');
    });

    it('rejects wrong password on subsequent sign-in', async () => {
      const r = await req(port, 'POST', '/api/signin', { email: 'alice@node.local', password: 'wrong-password' });
      assert.equal(r.status, 400);
      assert.ok(r.body.error.includes('Invalid password'));
    });

    it('accepts correct password on subsequent sign-in with new token', async () => {
      const r1 = await req(port, 'POST', '/api/signin', { email: 'alice@node.local', password: 'node-pass-123' });
      assert.equal(r1.status, 200);
      assert.ok(r1.body.token);
      // Token should be different (new session)
      const r0 = await req(port, 'POST', '/api/signin', { email: 'alice@node.local', password: 'node-pass-123' });
      assert.notEqual(r0.body.token, r1.body.token);
    });
  });

  // ── Sign-out ──────────────────────────────────────────────────────────────────

  describe('POST /api/signout', () => {
    it('returns signedOut true even when no session', async () => {
      const r = await req(port, 'POST', '/api/signout');
      assert.equal(r.status, 200);
      assert.equal(r.body.signedOut, true);
    });
  });

  // ── Protected routes ──────────────────────────────────────────────────────────

  describe('POST /api/start requires auth', () => {
    it('rejects without Authorization header', async () => {
      const r = await req(port, 'POST', '/api/start', { evmAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
      assert.equal(r.status, 400);
      assert.ok(r.body.error.includes('Authentication'));
    });

    it('rejects with invalid token', async () => {
      const r = await req(port, 'POST', '/api/start', { evmAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, {
        'Authorization': 'Bearer invalid-token-123'
      });
      assert.equal(r.status, 400);
      assert.ok(r.body.error.includes('Authentication'));
    });

    it('rejects with malformed Authorization header', async () => {
      const r = await req(port, 'POST', '/api/start', { evmAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, {
        'Authorization': 'Basic abc123'
      });
      assert.equal(r.status, 400);
      assert.ok(r.body.error.includes('Authentication'));
    });

    it('accepts with valid token (auth passes, then nodeManager check kicks in)', async () => {
      // Reuse alice's account (created earlier in this suite) to get a fresh token
      const signin = await req(port, 'POST', '/api/signin', { email: 'alice@node.local', password: 'node-pass-123' });
      assert.equal(signin.status, 200, `Sign-in failed: ${JSON.stringify(signin.body)}`);
      const token = signin.body.token;

      // Now hit protected endpoint — auth passes, but nodeManager isn't a real NodeManager
      const r = await req(port, 'POST', '/api/start', { evmAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, {
        'Authorization': `Bearer ${token}`
      });
      // Auth must pass → response should NOT be "Authentication required"
      const isAuthError = r.status === 400 && (r.body.error || '').includes('Authentication');
      assert.equal(isAuthError, false, `Expected auth to pass but got: ${r.status} ${JSON.stringify(r.body)}`);
      // After auth passes, handleStart tries nodeManager.start() on the mock → TypeError → 500
      assert.equal(r.status, 500);
    });
  });

  describe('POST /api/stop requires auth', () => {
    it('rejects without Authorization header', async () => {
      const r = await req(port, 'POST', '/api/stop');
      assert.equal(r.status, 400);
      assert.ok(r.body.error.includes('Authentication'));
    });
  });
});
