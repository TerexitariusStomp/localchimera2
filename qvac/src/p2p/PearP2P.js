import { Logger } from '../core/Logger.js';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';
import { CapabilityManifest } from './CapabilityManifest.js';

export class PearP2P {
  constructor(config) {
    this.config = config;
    this.logger = new Logger('PearP2P');
    this.peers = new Map();
    this.isRunning = false;
    this.swarm = null;
    this.topics = new Map(); // topic -> { joinedAt }
    this.messageHandlers = new Map();
    this.capabilityManifest = new CapabilityManifest(config.capabilityManifest || {});
  }

  async initialize() {
    this.logger.info('Initializing Pear P2P with Hyperswarm...');
    this.swarm = new Hyperswarm();

    this.swarm.on('connection', (conn, info) => {
      const peerId = info.publicKey?.toString('hex')?.slice(0, 16) || crypto.randomUUID();
      this.logger.info(`Peer connected: ${peerId}`);
      this.peers.set(peerId, { conn, info, connected: true, connectedAt: Date.now() });

      conn.on('data', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'capability-manifest') {
            const stored = this.capabilityManifest.storePeerManifest(peerId, msg.manifest);
            if (stored) this.logger.info(`Received capability manifest from ${peerId}: ${msg.manifest.models?.length || 0} models`);
            return;
          }
          this.logger.debug(`Message from ${peerId}: ${msg.type}`);
          for (const handler of this.messageHandlers.values()) {
            try { handler(msg, peerId); } catch (e) { this.logger.error('Handler error:', e); }
          }
        } catch (e) {
          this.logger.debug('Non-JSON data from peer');
        }
      });

      conn.on('close', () => {
        this.logger.info(`Peer disconnected: ${peerId}`);
        this.peers.delete(peerId);
      });

      conn.on('error', (err) => {
        this.logger.error(`Peer ${peerId} error:`, err.message);
        this.peers.delete(peerId);
      });
    });

    this.logger.info('Hyperswarm initialized');
  }

  async start() {
    this.logger.info('Starting Pear P2P network...');
    if (this.config.discovery && this.config.defaultTopic) {
      await this.joinTopic(Buffer.from(this.config.defaultTopic, 'hex'));
    }
    this.isRunning = true;
    this.logger.info('Pear P2P network started');
  }

  async stop() {
    this.logger.info('Stopping Pear P2P network...');
    if (this.swarm) {
      for (const [topic] of this.topics) {
        await this.swarm.leave(topic);
      }
      await this.swarm.destroy();
    }
    this.peers.clear();
    this.topics.clear();
    this.isRunning = false;
    this.logger.info('Pear P2P network stopped');
  }

  generateTopic() {
    return crypto.randomBytes(32);
  }

  async joinTopic(topicBuffer, meta = {}) {
    const topicHex = topicBuffer.toString('hex');
    if (this.topics.has(topicHex)) {
      this.logger.info(`Already joined topic ${topicHex.slice(0, 16)}...`);
      return topicHex;
    }
    await this.swarm.join(topicBuffer, { client: true, server: true });
    this.topics.set(topicHex, { joinedAt: Date.now(), scope: meta.scope || 'wiki', pageId: meta.pageId || null, title: meta.title || null });
    this.logger.info(`Joined topic ${topicHex.slice(0, 16)}... (scope: ${meta.scope || 'wiki'})`);
    return topicHex;
  }

  async leaveTopic(topicHex) {
    const topicBuffer = Buffer.from(topicHex, 'hex');
    await this.swarm.leave(topicBuffer);
    this.topics.delete(topicHex);
    this.logger.info(`Left topic ${topicHex.slice(0, 16)}...`);
  }

  async broadcast(message) {
    if (!this.isRunning || this.peers.size === 0) {
      this.logger.debug('No peers to broadcast to');
      return;
    }
    const payload = JSON.stringify(message) + '\n';
    for (const [peerId, peer] of this.peers) {
      if (peer.connected && peer.conn && !peer.conn.destroyed) {
        try {
          peer.conn.write(payload);
          this.logger.debug(`Sent to peer: ${peerId}`);
        } catch (e) {
          this.logger.error(`Failed to send to ${peerId}:`, e.message);
        }
      }
    }
  }

  async broadcastToTopics(message, { scope = 'wiki', pageId = null }) {
    if (!this.isRunning || this.peers.size === 0) return;
    const payload = JSON.stringify({ ...message, _swarmScope: scope, _pageId: pageId }) + '\n';
    for (const [peerId, peer] of this.peers) {
      if (peer.connected && peer.conn && !peer.conn.destroyed) {
        try { peer.conn.write(payload); } catch (e) {}
      }
    }
  }

  async broadcastCapabilityManifest(manifest) {
    if (!this.isRunning || this.peers.size === 0) return;
    const payload = JSON.stringify({ type: 'capability-manifest', manifest }) + '\n';
    for (const [peerId, peer] of this.peers) {
      if (peer.connected && peer.conn && !peer.conn.destroyed) {
        try { peer.conn.write(payload); } catch (e) {}
      }
    }
    this.logger.debug(`Broadcasted capability manifest to ${this.peers.size} peers`);
  }

  getTopicsByScope(scope, pageId = null) {
    const results = [];
    for (const [hex, meta] of this.topics) {
      if (meta.scope === scope) {
        if (scope === 'wiki' || (scope === 'page' && meta.pageId === pageId)) {
          results.push({ hex, ...meta });
        }
      }
    }
    return results;
  }

  onMessage(handlerId, handler) {
    this.messageHandlers.set(handlerId, handler);
  }

  offMessage(handlerId) {
    this.messageHandlers.delete(handlerId);
  }

  getStatus() {
    return {
      running: this.isRunning,
      peerCount: this.peers.size,
      topics: Array.from(this.topics.keys()).map(t => t.slice(0, 16) + '...'),
      discovery: this.config.discovery,
      capabilityManifest: this.capabilityManifest?.getStatus() || null,
    };
  }

  getTopicList() {
    return Array.from(this.topics.entries()).map(([hex, meta]) => ({
      topic: hex,
      short: hex.slice(0, 16) + '...',
      joinedAt: meta.joinedAt,
      scope: meta.scope,
      pageId: meta.pageId,
      title: meta.title
    }));
  }
}
