// Bare worker entry — runs QVAC inference backend on-device
import { loadModel, completion, unloadModel, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";
import BareKit from "bare-kit";

const IPC = BareKit.IPC;
let modelId = null;
let modelLoading = false;
let modelLoadError = null;

const MODEL_MAP = {
  "LLAMA_3_2_1B_INST_Q4_0": LLAMA_3_2_1B_INST_Q4_0,
};

async function ensureModelLoaded(modelKey = "LLAMA_3_2_1B_INST_Q4_0") {
  if (modelId) return modelId;
  if (modelLoading) {
    while (modelLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (modelId) return modelId;
    throw new Error(modelLoadError || "Model load failed");
  }

  modelLoading = true;
  modelLoadError = null;
  try {
    const modelSrc = MODEL_MAP[modelKey];
    if (!modelSrc) throw new Error(`Unknown model: ${modelKey}`);

    modelId = await loadModel({
      modelSrc,
      modelType: "llm",
      onProgress: (progress) => {
        IPC.send(JSON.stringify({ type: "model-progress", progress }));
      },
    });
    IPC.send(JSON.stringify({ type: "model-loaded", modelId }));
    return modelId;
  } catch (e) {
    modelLoadError = e.message;
    IPC.send(JSON.stringify({ type: "model-error", error: e.message }));
    throw e;
  } finally {
    modelLoading = false;
  }
}

async function handleAIWrite({ prompt, title }) {
  const mid = await ensureModelLoaded();
  const history = [{ role: "user", content: prompt }];
  const result = completion({ modelId: mid, history, stream: false });
  let body = "";
  for await (const token of result.tokenStream) {
    body += token;
  }
  return {
    success: true,
    data: {
      title: title || "Generated",
      body,
      source: "qvac-on-device",
      model: "LLAMA_3_2_1B_INST_Q4_0",
    },
  };
}

async function handleAIStatus() {
  return {
    success: true,
    data: {
      available: true,
      qvacAvailable: !!modelId,
      model: modelId ? "LLAMA_3_2_1B_INST_Q4_0" : null,
      modelLoading,
    },
  };
}

async function handleAIDocs() {
  return { success: true, data: [] };
}

IPC.on("message", async (data) => {
  try {
    const req = JSON.parse(data);
    const { id, method, path, body } = req;

    let res;
    if (method === "POST" && path === "/api/ai-write") {
      res = await handleAIWrite(body);
    } else if (method === "GET" && path === "/api/ai-status") {
      res = await handleAIStatus();
    } else if (method === "GET" && path === "/api/ai-docs") {
      res = await handleAIDocs();
    } else {
      res = { success: false, error: "Not found" };
    }

    IPC.send(JSON.stringify({ type: "response", id, ...res }));
  } catch (e) {
    IPC.send(JSON.stringify({ type: "response", id: req?.id, success: false, error: e.message }));
  }
});

IPC.send(JSON.stringify({ type: "ready" }));
