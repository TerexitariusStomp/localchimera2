import { Logger } from './Logger.js';
import { AuditLogger } from './AuditLogger.js';
import { ContentAddress } from './ContentAddress.js';
import { DeploymentLifecycle } from './DeploymentLifecycle.js';
import { promises as fsp } from 'fs';
import path from 'path';
import { QVACInferenceLayer } from '../inference/QVACInferenceLayer.js';
import { LocalLLM } from '../inference/LocalLLM.js';
import { EmbeddingService } from '../inference/EmbeddingService.js';
import { ProofOfInference } from '../inference/ProofOfInference.js';
import { InferenceQueue } from '../inference/InferenceQueue.js';
import { PromptGuard } from '../inference/PromptGuard.js';
import { PromptBudgeter } from '../inference/PromptBudgeter.js';
import { TokenMeter } from '../inference/TokenMeter.js';
import { VoicePipeline } from '../inference/VoicePipeline.js';
import { AgentLoop } from '../inference/AgentLoop.js';
import { DocumentChunker, CitationRegistry } from '../inference/DocumentChunker.js';
import { CircuitBreaker } from '../inference/CircuitBreaker.js';
import { MemoryCompactor } from '../inference/MemoryCompactor.js';
import { KnowledgeGraph } from '../inference/KnowledgeGraph.js';
import { ReceiptGossip, DynamicPricing } from '../inference/ReceiptGossip.js';
import { ModelRegistry } from '../inference/ModelRegistry.js';
import { ToolResultCache } from '../inference/ToolResultCache.js';
import { SemanticDedup } from '../inference/SemanticDedup.js';
import { SLAEnforcer } from '../inference/SLAEnforcer.js';
import { TaskDecomposer } from '../inference/TaskDecomposer.js';
import { ConversationBrancher } from '../inference/ConversationBrancher.js';
import { AutoTagger } from '../inference/AutoTagger.js';
import { ConversationExporter } from '../inference/ConversationExporter.js';
import { ConfidenceRouter } from '../inference/ConfidenceRouter.js';
import { SpendPolicy } from '../inference/SpendPolicy.js';
import { EscrowChannel } from '../inference/EscrowChannel.js';
import { MemoryManager } from '../inference/MemoryManager.js';
import { HybridRetriever } from '../inference/HybridRetriever.js';
import { EnrichmentQueue } from '../inference/EnrichmentQueue.js';
import { LinkMetadataCache } from '../inference/LinkMetadataCache.js';
import { VisionCaptioner } from '../inference/VisionCaptioner.js';
import { EvidenceExporter } from '../inference/EvidenceExporter.js';
import { MCPClient } from '../inference/MCPClient.js';
import { AutoLinker } from '../inference/AutoLinker.js';
import { CapabilityProber } from '../inference/CapabilityProber.js';
import { MarketplaceBroadcaster } from '../inference/MarketplaceBroadcaster.js';
import { MemoryExtractor } from '../inference/MemoryExtractor.js';
import { HypercoreStore } from '../storage/HypercoreStore.js';
import { CryptoVault } from '../storage/CryptoVault.js';
import { ContentPinner } from '../p2p/ContentPinner.js';
import { PearP2P } from '../p2p/PearP2P.js';
import { CapabilityManifest } from '../p2p/CapabilityManifest.js';
import { PeerReputation } from '../p2p/PeerReputation.js';
import { MinerManager } from '../miners/MinerManager.js';
import { AuthService } from '../auth/AuthService.js';
import { TaskMonitor } from '../scheduler/TaskMonitor.js';
import { WebServer } from '../web/server.js';
import { WalletManager } from './WalletManager.js';
import { MultisigManager } from './MultisigManager.js';
import { MonthlyDistributor } from '../payout/MonthlyDistributor.js';
import { CasperAutoRegistrar } from '../casper/CasperAutoRegistrar.js';

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
    // New modules
    this.proofOfInference = null;
    this.inferenceQueue = null;
    this.promptGuard = null;
    this.promptBudgeter = null;
    this.tokenMeter = null;
    this.voicePipeline = null;
    this.agentLoop = null;
    this.documentChunker = null;
    this.citationRegistry = null;
    this.contentAddress = null;
    this.capabilityManifest = null;
    this.deploymentLifecycle = null;
    this.circuitBreaker = null;
    this.peerReputation = null;
    this.memoryCompactor = null;
    this.knowledgeGraph = null;
    this.cryptoVault = null;
    this.receiptGossip = null;
    this.dynamicPricing = null;
    this.modelRegistry = null;
    this.toolResultCache = null;
    this.semanticDedup = null;
    this.slaEnforcer = null;
    this.contentPinner = null;
    this.taskDecomposer = null;
    this.conversationBrancher = null;
    this.autoTagger = null;
    this.conversationExporter = null;
    this.confidenceRouter = null;
    this.spendPolicy = null;
    this.escrowChannel = null;
    this.memoryManager = null;
    this.hybridRetriever = null;
    this.enrichmentQueue = null;
    this.linkMetadataCache = null;
    this.visionCaptioner = null;
    this.evidenceExporter = null;
    this.mcpClient = null;
    this.autoLinker = null;
    this.capabilityProber = null;
    this.marketplaceBroadcaster = null;
    this.memoryExtractor = null;
    this.casperRegistrar = null;
    this.isRunning = false;
  }

  async initialize() {
    this.logger.info('Initializing node components...');

    this.audit = new AuditLogger(this.config.audit || {});
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

    this.inferenceLayer = new QVACInferenceLayer(this.config.inference, this.taskMonitor, this.audit);
    await this.inferenceLayer.initialize();

    this.localLLM = new LocalLLM(this.config.inference?.localLLM || {});
    await this.localLLM.initialize();

    this.embeddingService = new EmbeddingService({ ...(this.config.inference?.embedding || {}), audit: this.audit });
    await this.embeddingService.initialize();

    this.minerManager = new MinerManager(this.config.miners, this.dataStore, this.taskMonitor, this.inferenceLayer);
    await this.minerManager.initialize();

    // Initialize new modules
    this.proofOfInference = new ProofOfInference(this.config.proofOfInference || {});
    this.inferenceQueue = new InferenceQueue(this.config.inference?.queue || {});
    this.promptGuard = new PromptGuard(this.config.promptGuard || {});
    this.promptBudgeter = new PromptBudgeter(this.config.promptBudgeter || {});
    this.tokenMeter = new TokenMeter(this.config.tokenMeter || {});
    this.voicePipeline = new VoicePipeline({ ...(this.config.voicePipeline || {}), audit: this.audit });
    await this.voicePipeline.initialize();
    this.agentLoop = new AgentLoop(this.config.agentLoop || {});
    this.documentChunker = new DocumentChunker(this.config.documentChunker || {});
    this.citationRegistry = new CitationRegistry();
    this.contentAddress = new ContentAddress(this.config.contentAddress || {});
    this.capabilityManifest = new CapabilityManifest(this.config.capabilityManifest || {});
    this.deploymentLifecycle = new DeploymentLifecycle(this.config.deploymentLifecycle || {});
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker || {});
    this.peerReputation = new PeerReputation(this.config.peerReputation || {});
    this.peerReputation.start();
    this.memoryCompactor = new MemoryCompactor(this.config.memoryCompactor || {});
    this.knowledgeGraph = new KnowledgeGraph({ ...(this.config.knowledgeGraph || {}), persistStore: this.dataStore });
    this.cryptoVault = new CryptoVault(this.config.cryptoVault || {});
    this.receiptGossip = new ReceiptGossip(this.config.receiptGossip || {});
    this.dynamicPricing = new DynamicPricing(this.config.dynamicPricing || {});
    this.modelRegistry = new ModelRegistry(this.config.modelRegistry || {});
    this.toolResultCache = new ToolResultCache(this.config.toolResultCache || {});
    this.toolResultCache.start();
    this.semanticDedup = new SemanticDedup(this.config.semanticDedup || {});
    this.slaEnforcer = new SLAEnforcer(this.config.slaEnforcer || {});
    this.contentPinner = new ContentPinner(this.config.contentPinner || {});
    this.contentPinner.setP2P(this.p2pNetwork);
    this.contentPinner.setCryptoVault(this.cryptoVault);
    this.contentPinner.start();
    this.taskDecomposer = new TaskDecomposer(this.config.taskDecomposer || {});
    this.conversationBrancher = new ConversationBrancher(this.config.conversationBrancher || {});
    this.autoTagger = new AutoTagger(this.config.autoTagger || {});
    this.conversationExporter = new ConversationExporter(this.config.conversationExporter || {});
    this.confidenceRouter = new ConfidenceRouter(this.config.confidenceRouter || {});
    this.spendPolicy = new SpendPolicy(this.config.spendPolicy || {});
    this.escrowChannel = new EscrowChannel(this.config.escrowChannel || {});
    this.escrowChannel.setWalletManager(this.walletManager);
    this.memoryManager = new MemoryManager(this.config.memoryManager || {});
    this.memoryManager.start();
    this.hybridRetriever = new HybridRetriever(this.config.hybridRetriever || {});
    this.enrichmentQueue = new EnrichmentQueue(this.config.enrichmentQueue || {});
    this.linkMetadataCache = new LinkMetadataCache(this.config.linkMetadataCache || {});
    this.visionCaptioner = new VisionCaptioner(this.config.visionCaptioner || {});
    this.evidenceExporter = new EvidenceExporter(this.config.evidenceExporter || {});
    this.mcpClient = new MCPClient(this.config.mcpClient || {});
    this.autoLinker = new AutoLinker(this.config.autoLinker || {});
    this.autoLinker.setKnowledgeGraph(this.knowledgeGraph);
    this.capabilityProber = new CapabilityProber(this.config.capabilityProber || {});
    this.capabilityProber.setInferenceLayer(this.inferenceLayer);
    this.capabilityProber.setModelRegistry(this.modelRegistry);
    this.marketplaceBroadcaster = new MarketplaceBroadcaster(this.config.marketplaceBroadcaster || {});
    this.marketplaceBroadcaster.setP2P(this.p2pNetwork);
    this.marketplaceBroadcaster.setCapabilityProber(this.capabilityProber);
    this.marketplaceBroadcaster.setDynamicPricing(this.dynamicPricing);
    this.memoryExtractor = new MemoryExtractor(this.config.memoryExtractor || {});
    this.memoryExtractor.setInferenceLayer(this.inferenceLayer);
    this.memoryExtractor.setKnowledgeGraph(this.knowledgeGraph);
    this.memoryExtractor.setMemoryManager(this.memoryManager);

    // Register known models in registry
    const qvacCfg = this.config.inference?.qvac || {};
    if (qvacCfg.models) {
      for (const modelName of qvacCfg.models) {
        this.modelRegistry.register({
          name: modelName,
          type: 'llm',
          contextLength: 4096,
          quantization: 'q4_0',
          modelConst: qvacCfg.modelConst,
        });
      }
    }
    if (this.config.inference?.embedding?.model) {
      this.modelRegistry.register({
        name: this.config.inference.embedding.model,
        type: 'embedding',
        contextLength: 2048,
        quantization: 'q4_0',
        modelConst: this.config.inference.embedding.qvacModelConst,
      });
    }
    if (this.config.voicePipeline?.whisperModel) {
      this.modelRegistry.register({
        name: this.config.voicePipeline.whisperModel,
        type: 'stt',
        contextLength: 0,
        quantization: 'q5_1',
      });
    }

    // Wire receipt gossip to P2P
    this.receiptGossip.setP2P(this.p2pNetwork);

    // Inject inference queue into inference layer for serialized execution
    this.inferenceLayer.setQueue(this.inferenceQueue);
    this.inferenceLayer.setPromptGuard(this.promptGuard);
    this.inferenceLayer.setPromptBudgeter(this.promptBudgeter);
    this.inferenceLayer.setProofOfInference(this.proofOfInference);
    this.inferenceLayer.setTokenMeter(this.tokenMeter);
    this.inferenceLayer.setCircuitBreaker(this.circuitBreaker);

    this.webServer = new WebServer(this.config, this);
    await this.webServer.initialize();

    this.monthlyDistributor = new MonthlyDistributor(this.webServer.payoutRouter);

    this.casperRegistrar = new CasperAutoRegistrar(this.config);
    await this.casperRegistrar.initialize();

    this.logger.info('All components initialized (including PoI, PromptGuard, TokenMeter, VoicePipeline, AgentLoop, CapabilityManifest, ContentAddress, DeploymentLifecycle, CircuitBreaker, PeerReputation, MemoryCompactor, KnowledgeGraph, CryptoVault, ReceiptGossip, DynamicPricing, ModelRegistry, ToolResultCache, SemanticDedup, SLAEnforcer, ContentPinner, TaskDecomposer, ConversationBrancher, AutoTagger, ConversationExporter, ConfidenceRouter, SpendPolicy, EscrowChannel, MemoryManager, HybridRetriever, EnrichmentQueue, LinkMetadataCache, VisionCaptioner, EvidenceExporter, MCPClient, AutoLinker, CapabilityProber, MarketplaceBroadcaster, MemoryExtractor)');
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
    await this.audit.stop();
    await this.minerManager.stop();
    await this.embeddingService.stop?.();
    await this.inferenceLayer.stop();
    await this.taskMonitor.stop();
    await this.walletManager.disconnectAllWallets();
    await this.p2pNetwork.stop();
    await this.dataStore.stop();

    // Stop monthly distributor
    if (this.monthlyDistributor) this.monthlyDistributor.stop();

    // Stop inference queue
    if (this.inferenceQueue) this.inferenceQueue.reset();

    // Stop peer reputation decay timer
    if (this.peerReputation) this.peerReputation.stop();

    // Persist knowledge graph
    if (this.knowledgeGraph) this.knowledgeGraph.persist();

    // Stop timers
    if (this.toolResultCache) this.toolResultCache.stop();
    if (this.contentPinner) this.contentPinner.stop();

    this.isRunning = false;
    this.logger.info('Node stopped successfully');
  }
  
  getStatus() {
    return {
      running: this.isRunning,
      nodeId: this.config.node.id,
      inference: this.inferenceLayer?.getStatus(),
      localLLM: this.localLLM?.getStatus(),
      embedding: this.embeddingService?.getStatus(),
      mining: this.minerManager?.getStatus(),
      tasks: this.taskMonitor?.getStatus(),
      p2p: this.p2pNetwork?.getStatus(),
      wallets: this.walletManager?.getStatus(),
      multisig: this.multisigManager?.getStatus(),
      // New modules
      proofOfInference: this.proofOfInference?.getStatus(),
      inferenceQueue: this.inferenceQueue?.getStats(),
      promptGuard: this.promptGuard?.getStats(),
      promptBudgeter: this.promptBudgeter?.getStatus(),
      tokenMeter: this.tokenMeter?.getStatus(),
      voicePipeline: this.voicePipeline?.getStatus(),
      agentLoop: this.agentLoop?.getStatus(),
      contentAddress: this.contentAddress?.getStats(),
      capabilityManifest: this.capabilityManifest?.getStatus(),
      deploymentLifecycle: this.deploymentLifecycle?.getStatus(),
      citations: this.citationRegistry?.getStats(),
      circuitBreaker: this.circuitBreaker?.getStatus(),
      peerReputation: this.peerReputation?.getStatus(),
      memoryCompactor: this.memoryCompactor?.getStats(),
      knowledgeGraph: this.knowledgeGraph?.getStats(),
      cryptoVault: this.cryptoVault?.getStats(),
      receiptGossip: this.receiptGossip?.getStats(),
      dynamicPricing: this.dynamicPricing?.getStats(),
      modelRegistry: this.modelRegistry?.getStats(),
      toolResultCache: this.toolResultCache?.getStats(),
      semanticDedup: this.semanticDedup?.getStats(),
      slaEnforcer: this.slaEnforcer?.getStats(),
      contentPinner: this.contentPinner?.getStats(),
      taskDecomposer: this.taskDecomposer?.getStats(),
      conversationBrancher: this.conversationBrancher?.getStats(),
      autoTagger: this.autoTagger?.getStats(),
      conversationExporter: this.conversationExporter?.getStats(),
      confidenceRouter: this.confidenceRouter?.getStats(),
      spendPolicy: this.spendPolicy?.getStats(),
      escrowChannel: this.escrowChannel?.getStats(),
      memoryManager: this.memoryManager?.getStats(),
      hybridRetriever: this.hybridRetriever?.getStats(),
      enrichmentQueue: this.enrichmentQueue?.getStats(),
      linkMetadataCache: this.linkMetadataCache?.getStats(),
      visionCaptioner: this.visionCaptioner?.getStats(),
      evidenceExporter: this.evidenceExporter?.getStats(),
      mcpClient: this.mcpClient?.getStats(),
      autoLinker: this.autoLinker?.getStats(),
      capabilityProber: this.capabilityProber?.getStats(),
      marketplaceBroadcaster: this.marketplaceBroadcaster?.getStats(),
      memoryExtractor: this.memoryExtractor?.getStats(),
    };
  }
}
