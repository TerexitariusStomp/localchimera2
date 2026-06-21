import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { loadModel, completion, LLAMA_3_2_1B_INST_Q4_0 } from '@qvac/sdk';

export default function App() {
  const [modelStatus, setModelStatus] = useState('initializing');
  const [frontendUri, setFrontendUri] = useState(null);
  const [modelId, setModelId] = useState(null);
  const webViewRef = useRef(null);
  const bridgeResolvers = useRef(new Map());
  const reqId = useRef(0);

  useEffect(() => {
    async function init() {
      try {
        // Load frontend assets
        const asset = await Asset.fromModule(require('./assets/frontend/index.html'));
        setFrontendUri(asset.localUri || asset.uri);

        // Load on-device LLM via QVAC SDK
        setModelStatus('downloading model...');
        const mid = await loadModel({
          modelSrc: LLAMA_3_2_1B_INST_Q4_0,
          modelType: 'llm',
          onProgress: (p) => {
            setModelStatus(`downloading model: ${Math.round(p * 100)}%`);
          },
        });
        setModelId(mid);
        setModelStatus('ready');
      } catch (e) {
        console.error('Init error:', e);
        setModelStatus(`error: ${e.message}`);
      }
    }
    init();
  }, []);

  async function handleAIWrite(body) {
    if (!modelId) throw new Error('Model not loaded');
    const history = [{ role: 'user', content: body.prompt }];
    const result = completion({ modelId, history, stream: false });
    let generated = '';
    for await (const token of result.tokenStream) {
      generated += token;
    }
    return {
      success: true,
      data: {
        title: body.title || 'Generated',
        body: generated,
        source: 'qvac-on-device',
        model: 'LLAMA_3_2_1B_INST_Q4_0',
      },
    };
  }

  async function handleAIStatus() {
    return {
      success: true,
      data: {
        available: true,
        qvacAvailable: !!modelId,
        model: modelId ? 'LLAMA_3_2_1B_INST_Q4_0' : null,
        modelLoading: !modelId && modelStatus !== 'ready',
      },
    };
  }

  async function handleAIDocs() {
    return { success: true, data: [] };
  }

  const handleWebViewMessage = async (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === 'bridge-ready') return;

      const { id, method, path, body } = msg;
      let res;

      if (method === 'POST' && path === '/api/ai-write') {
        res = await handleAIWrite(body);
      } else if (method === 'GET' && path === '/api/ai-status') {
        res = await handleAIStatus();
      } else if (method === 'GET' && path === '/api/ai-docs') {
        res = await handleAIDocs();
      } else {
        res = { success: false, error: 'Not found' };
      }

      webViewRef.current?.injectJavaScript(`
        window.__bridgeResolve(${id}, ${JSON.stringify(res)});
        true;
      `);
    } catch (e) {
      console.error('Bridge error:', e);
    }
  };

  const injectedBridge = `
    (function() {
      if (window.__bridgeActive) return;
      window.__bridgeActive = true;
      window.__bridgeFetch = true;
      window.__bridgeResolvers = {};
      window.__bridgeResolve = function(id, data) {
        const cb = window.__bridgeResolvers[id];
        if (cb) cb(data);
        delete window.__bridgeResolvers[id];
      };

      const originalFetch = window.fetch;
      const isApiCall = (url) => {
        if (typeof url !== 'string') return false;
        return url.startsWith('/api') || url.startsWith('http://localhost:3002/api');
      };
      const extractPath = (url) => {
        if (url.startsWith('/api')) return url;
        return url.replace('http://localhost:3002', '');
      };

      window.fetch = async function(url, options = {}) {
        if (isApiCall(url)) {
          return new Promise((resolve, reject) => {
            const id = Date.now() + Math.random();
            const body = options.body ? JSON.parse(options.body) : {};
            window.__bridgeResolvers[id] = (res) => {
              resolve(new Response(JSON.stringify(res), {
                status: res.success ? 200 : 500,
                headers: { 'Content-Type': 'application/json' }
              }));
            };
            window.ReactNativeWebView.postMessage(JSON.stringify({
              id, method: options.method || 'GET', path: extractPath(url), body
            }));
            setTimeout(() => {
              if (window.__bridgeResolvers[id]) {
                delete window.__bridgeResolvers[id];
                reject(new Error('Bridge timeout'));
              }
            }, 120000);
          });
        }
        return originalFetch(url, options);
      };

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bridge-ready' }));
    })();
  `;

  if (!frontendUri) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00e5ff" />
        <Text style={styles.text}>Loading Chimera...</Text>
      </View>
    );
  }

  if (modelStatus !== 'ready') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00e5ff" />
        <Text style={styles.text}>{modelStatus}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: frontendUri }}
        style={styles.webview}
        injectedJavaScript={injectedBridge}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webview: {
    flex: 1,
    width: '100%',
  },
  text: {
    color: '#e8e2d8',
    marginTop: 16,
    fontSize: 14,
  },
});
