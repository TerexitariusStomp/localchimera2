import { Logger } from '../core/Logger.js';

/**
 * VoicePipeline — on-device voice transcription, summarization, and embedding.
 *
 * Inspired by mem-it:
 *   record (WAV) → Whisper STT → unload → Llama summary + action items
 *   → unload → GTE embeddings → transcript-chunk vectors → unload
 *
 * Uses @qvac/sdk for all model inference. Models are loaded one at a time
 * (load → infer → unload) to respect memory discipline on edge devices.
 *
 * The pipeline produces:
 *   - Transcript text
 *   - Summary + action items
 *   - Chunk embeddings for RAG retrieval
 *   - Knowledge graph nodes/edges (entities extracted from transcript)
 */

export class VoicePipeline {
  constructor(config = {}) {
    this.logger = new Logger('VoicePipeline');
    this.qvac = null;
    this.config = {
      whisperModel: config.whisperModel || 'WHISPER_TINY_EN_Q5_1',
      llmModel: config.llmModel || 'LLAMA_3_2_1B_INST_Q4_0',
      embeddingModel: config.embeddingModel || 'EMBEDDINGGEMMA_300M_Q4_0',
      chunkSize: config.chunkSize || 512,
      chunkOverlap: config.chunkOverlap || 50,
      ...config,
    };
    this.audit = config.audit || null;
    this._initialized = false;
  }

  async initialize() {
    this.logger.info('Initializing VoicePipeline...');
    try {
      this.qvac = await import('@qvac/sdk');
      this._initialized = true;
      this.logger.info('VoicePipeline initialized (QVAC SDK loaded)');
    } catch (e) {
      this.logger.warn(`QVAC SDK not available for VoicePipeline: ${e.message}`);
      this.qvac = null;
    }
  }

  /**
   * Run the full voice pipeline on an audio file.
   * @param {string} audioPath - path to WAV/audio file
   * @param {object} options - { workspace, generateSummary, generateEmbeddings }
   */
  async process(audioPath, options = {}) {
    if (!this.qvac) throw new Error('QVAC SDK not available');
    const {
      workspace = 'voice-transcripts',
      generateSummary = true,
      generateEmbeddings = true,
    } = options;

    this.logger.info(`Processing audio: ${audioPath}`);
    const pipelineStart = Date.now();

    // Phase 1: Transcription (Whisper)
    const transcript = await this._transcribe(audioPath);
    if (!transcript || !transcript.text) {
      throw new Error('Transcription produced no output');
    }

    const result = {
      audioPath,
      transcript: transcript.text,
      durationMs: transcript.durationMs,
      summary: null,
      actionItems: null,
      chunks: [],
      nodes: [],
      edges: [],
      embeddings: null,
    };

    // Phase 2: Summary + action items (Llama)
    if (generateSummary) {
      const summaryResult = await this._summarize(transcript.text);
      result.summary = summaryResult.summary;
      result.actionItems = summaryResult.actionItems;
      result.nodes = summaryResult.nodes;
      result.edges = summaryResult.edges;
    }

    // Phase 3: Chunk + embed
    if (generateEmbeddings) {
      const chunkResult = await this._chunkAndEmbed(transcript.text, workspace);
      result.chunks = chunkResult.chunks;
      result.embeddings = chunkResult.embeddings;
    }

    result.totalDurationMs = Date.now() - pipelineStart;
    this.logger.info(`Voice pipeline complete: ${result.totalDurationMs}ms`);
    return result;
  }

  /**
   * Phase 1: Transcribe audio using Whisper via QVAC SDK.
   */
  async _transcribe(audioPath) {
    const { loadModel, transcribe, unloadModel } = this.qvac;
    const modelConst = this.qvac[this.config.whisperModel] || this.qvac.WHISPER_TINY_EN_Q5_1;

    this.logger.info('Loading Whisper model...');
    const loadStart = Date.now();
    const modelId = await loadModel({
      modelSrc: modelConst,
      modelType: 'whisper',
      modelConfig: { device: 'cpu' },
    });
    const loadMs = Date.now() - loadStart;
    if (this.audit) this.audit.modelLoad({ modelId, durationMs: loadMs, source: 'voice-whisper' });

    try {
      const transcribeStart = Date.now();
      const result = await transcribe({ modelId, audioPath });
      const transcribeMs = Date.now() - transcribeStart;
      this.logger.info(`Transcription complete: ${transcribeMs}ms`);
      if (this.audit) this.audit.inference({
        prompt: `[audio: ${audioPath}]`,
        outputTokens: Math.ceil((result.text || '').length / 4),
        durationMs: transcribeMs,
        modelId,
        source: 'voice-whisper',
      });
      return { text: result.text || '', durationMs: transcribeMs };
    } finally {
      await unloadModel({ modelId });
      if (this.audit) this.audit.modelUnload({ modelId, source: 'voice-whisper' });
    }
  }

  /**
   * Phase 2: Summarize transcript and extract action items + entities.
   */
  async _summarize(transcript) {
    const { loadModel, completion, unloadModel } = this.qvac;
    const modelConst = this.qvac[this.config.llmModel] || this.qvac.LLAMA_3_2_1B_INST_Q4_0;

    this.logger.info('Loading LLM for summarization...');
    const modelId = await loadModel({
      modelSrc: modelConst,
      modelType: 'llm',
      modelConfig: { device: 'cpu' },
    });

    try {
      const prompt = `Analyze this transcript and provide:
1. A concise summary (2-3 sentences)
2. Action items (as a JSON array of strings)
3. Key entities (as a JSON array of {name, type} objects)

Transcript:
${transcript.slice(0, 3000)}`;

      const gen = completion({
        modelId,
        history: [
          { role: 'system', content: 'You are a meeting analyst. Respond in valid JSON with keys: summary, actionItems, entities.' },
          { role: 'user', content: prompt },
        ],
        stream: true,
        generationParams: { predict: 512, temp: 0.3 },
      });

      let output = '';
      for await (const token of gen.tokenStream) {
        output += token;
      }

      let parsed = {};
      try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        this.logger.warn('Failed to parse summary JSON, using raw output');
      }

      return {
        summary: parsed.summary || output.slice(0, 200),
        actionItems: parsed.actionItems || [],
        nodes: (parsed.entities || []).map(e => ({ name: e.name, type: e.type || 'entity' })),
        edges: [],
      };
    } finally {
      await unloadModel({ modelId });
    }
  }

  /**
   * Phase 3: Chunk transcript and generate embeddings for RAG.
   */
  async _chunkAndEmbed(transcript, workspace) {
    const chunks = this._chunkText(transcript, this.config.chunkSize, this.config.chunkOverlap);
    if (chunks.length === 0) return { chunks: [], embeddings: null };

    const { loadModel, embed, ragIngest, unloadModel } = this.qvac;
    const modelConst = this.qvac[this.config.embeddingModel] || this.qvac.EMBEDDINGGEMMA_300M_Q4_0;

    this.logger.info(`Loading embedding model for ${chunks.length} chunks...`);
    const modelId = await loadModel({
      modelSrc: modelConst,
      modelType: 'llamacpp-embedding',
      modelConfig: { device: 'cpu' },
    });

    try {
      const embedStart = Date.now();
      const result = await embed({ modelId, texts: chunks });
      const embedMs = Date.now() - embedStart;
      const vectors = result.vectors || result.embeddings || [];
      this.logger.info(`Embedded ${chunks.length} chunks in ${embedMs}ms`);

      // Ingest into RAG workspace
      if (ragIngest) {
        const documents = chunks.map((text, i) => ({
          id: `voice-chunk-${i}`,
          text,
          metadata: { source: 'voice-transcript', chunkIndex: i },
        }));
        await ragIngest({ modelId, workspace, documents });
        if (this.audit) this.audit.ragIngest({ docCount: documents.length, workspace, durationMs: embedMs, modelId });
      }

      return { chunks, embeddings: vectors };
    } finally {
      await unloadModel({ modelId });
    }
  }

  /**
   * Split text into overlapping chunks.
   */
  _chunkText(text, chunkSize, overlap) {
    if (!text || text.length <= chunkSize) return [text];
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - overlap;
      if (start >= text.length) break;
    }
    return chunks;
  }

  getStatus() {
    return {
      initialized: this._initialized,
      qvacAvailable: !!this.qvac,
      config: {
        whisperModel: this.config.whisperModel,
        llmModel: this.config.llmModel,
        embeddingModel: this.config.embeddingModel,
        chunkSize: this.config.chunkSize,
      },
    };
  }
}
