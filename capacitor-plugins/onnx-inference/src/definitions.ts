export interface OnnxInferencePlugin {
  loadModel(options: { modelPath: string }): Promise<{ success: boolean; message: string }>;
  runInference(options: { input: string; maxTokens?: number }): Promise<{ output: string; tokensGenerated: number; durationMs: number }>;
  connectRelay(options: { url: string; token: string }): Promise<{ connected: boolean; deviceId?: string; error?: string }>;
  disconnectRelay(): Promise<{ connected: boolean }>;
  getDeviceInfo(): Promise<{ platform: string; hasNeuralEngine: boolean; modelLoaded: boolean; deviceId: string; relayConnected: boolean }>;
}
