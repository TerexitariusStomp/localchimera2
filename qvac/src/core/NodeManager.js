import { Logger } from './Logger.js';
import { promises as fsp } from 'fs';
import path from 'path';
import { QVACInferenceLayer } from '../inference/QVACInferenceLayer.js';
import { LocalLLM } from '../inference/LocalLLM.js';
import { EmbeddingService } from '../inference/EmbeddingService.js';
import { HypercoreStore } from '../storage/HypercoreStore.js';
import { PearP2P } from '../p2p/PearP2P.js';
import { MinerManager } from '../miners/MinerManager.js';
import { AuthService } from '../auth/AuthService.js';
import { TaskMonitor } from '../scheduler/TaskMonitor.js';
import { WebServer } from '../web/server.js';
import { WalletManager } from './WalletManager.js';
import { MultisigManager } from './MultisigManager.js';
import { MonthlyDistributor } from '../payout/MonthlyDistributor.js';

export class NodeManager {
  constructor(config) {
    this.config = config;
    this.logger = new Logger('NodeManager');
    this.inferenceLayer = null;
    this.localLLM = null;
    this.embeddingService = null;
    this.dataStore = null;
    this.p2pNetwork = null;
    this.minerManager = null;
    this.authService = null;
    this.taskMonitor = null;
    this.webServer = null;
    this.walletManager = null;
    this.multisigManager = null;
    this.monthlyDistributor = null;
    this.isRunning = false;
  }

  async initialize() {
    this.logger.info('Initializing node components...');

    this.authService = new AuthService(this.config.auth);
    await this.authService.initialize();

    this.dataStore = new HypercoreStore(this.config.p2p.hypercore);
    await this.dataStore.initialize();

    this.p2pNetwork = new PearP2P(this.config.p2p.pear);
    await this.p2pNetwork.initialize();

    if (this.config.multisig?.enabled) {
      this.multisigManager = new MultisigManager(this.config.multisig);
      await this.multisigManager.initialize();
      const msStatus = this.multisigManager.getStatus();
      this.logger.info(`Protocol multisig system active: ${Object.keys(msStatus.protocolMultisigs).length} multisigs`);
    }

    this.walletManager = new WalletManager(this.config.miners);
    await this.walletManager.initialize();

    this.taskMonitor = new TaskMonitor();
    await this.taskMonitor.initialize();

    this.inferenceLayer = new QVACInferenceLayer(this.config.inference, this.taskMonitor);
    await this.inferenceLayer.initialize();

    this.localLLM = new LocalLLM(this.config.inference?.localLLM || {});
    await this.localLLM.initialize();

    this.embeddingService = new EmbeddingService(this.config.inference?.embedding || {});
    await this.embeddingService.initialize();

    this.minerManager = new MinerManager(this.config.miners, this.dataStore, this.taskMonitor, this.inferenceLayer);
    await this.minerManager.initialize();

    this.webServer = new WebServer(this.config, this);
    await this.webServer.initialize();

    this.monthlyDistributor = new MonthlyDistributor(this.webServer.payoutRouter);

    this.logger.info('All components initialized');
  }
  
  async start() {
    if (this.isRunning) {
      this.logger.warn('Node is already running');
      return;
    }
    
    this.logger.info('Starting node...');
    
    // Start data store
    await this.dataStore.start();
    
    // Start P2P network
    await this.p2pNetwork.start();

    this.p2pNetwork.onMessage('wiki-sync', async (msg, peerId) => {
      if (msg.type !== 'wiki-new-page') return;

      const swarmScope = msg._swarmScope || 'wiki';
      const msgPageId = msg._pageId || `${msg.category}/${msg.fileName}`;
      if (swarmScope === 'page') {
        const pageTopics = this.p2pNetwork.getTopicsByScope('page', msgPageId);
        if (pageTopics.length === 0) {
          this.logger.debug(`[swarm] Ignoring page-scoped message for ${msgPageId} — not in swarm`);
          return;
        }
      }

      this.logger.info(`[swarm] Received wiki page from peer ${peerId}: ${msg.title} (scope: ${swarmScope})`);
      const { title, category = 'concepts', content, tags = [] } = msg;
      try {
        const slug = (title || 'untitled').toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const fileName = `${slug || 'untitled'}.md`;
        const conceptId = `${category}/${slug || 'untitled'}`;
        const today = new Date().toISOString().split('T')[0];
        const wikiDir = path.join(process.cwd(), 'llmwiki-data', 'wiki', category);
        await fsp.mkdir(wikiDir, { recursive: true });
        const filePath = path.join(wikiDir, fileName);
        const frontmatter = `---\nid: ${conceptId}\ntitle: ${title}\ndescription: AI-generated wiki page\ntags: ${JSON.stringify(tags)}\ncreated: ${today}\nmodified: ${today}\n---\n\n`;
        await fsp.writeFile(filePath, frontmatter + (content || ''), 'utf-8');
        this.logger.info(`[swarm] Saved ${filePath}`);
        if (this.webServer?.indexer) await this.webServer.indexer.index();
      } catch (e) {
        this.logger.error(`[swarm] Failed to save incoming page: ${e.message}`);
      }
    });

    // Connect wallet manager
    await this.walletManager.connectAllWallets();
    
    // Start task monitor
    await this.taskMonitor.start();
    
    // Start inference layer
    await this.inferenceLayer.start();

    // Start embedding service (loads model on first use)
    await this.embeddingService.start();

    // NOTE: Miners are initialized but NOT auto-started.
    // The user must explicitly start them via the frontend
    // (POST /api/start with their EVM wallet address) after the node is running.
    // this.minerManager.start() is called from handleStart in WebServer.
    this.logger.info('Miners initialized but not started — waiting for user wallet + consent');

    // Start web server for dashboard API
    await this.webServer.start();

    // Start monthly distributor
    this.monthlyDistributor.start();

    this.isRunning = true;
    this.logger.info(`Node started — ID: ${this.config.node.id} | API: http://localhost:${process.env.PORT || 3002}/api/status`);
  }
  
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.logger.info('Stopping node...');
    
    // Stop components in reverse order
    await this.webServer.stop();
    await this.minerManager.stop();
    await this.embeddingService.stop?.();
    await this.inferenceLayer.stop();
    await this.taskMonitor.stop();
    await this.walletManager.disconnectAllWallets();
    await this.p2pNetwork.stop();
    await this.dataStore.stop();

    // Stop monthly distributor
    if (this.monthlyDistributor) this.monthlyDistributor.stop();

    this.isRunning = false;
    this.logger.info('Node stopped successfully');
  }
  
  getStatus() {
    return {
      running: this.isRunning,
      nodeId: this.config.node.id,
      // mode removed
      inference: this.inferenceLayer?.getStatus(),
      localLLM: this.localLLM?.getStatus(),
      embedding: this.embeddingService?.getStatus(),
      mining: this.minerManager?.getStatus(),
      tasks: this.taskMonitor?.getStatus(),
      p2p: this.p2pNetwork?.getStatus(),
      wallets: this.walletManager?.getStatus(),
      multisig: this.multisigManager?.getStatus()
    };
  }
}
