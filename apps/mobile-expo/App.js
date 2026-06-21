import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import BareKit from 'react-native-bare-kit';

const WORKER_BUNDLE = require('./worker.bundle');

export default function App() {
  const [workerReady, setWorkerReady] = useState(false);
  const [modelStatus, setModelStatus] = useState('initializing');
  const [frontendUri, setFrontendUri] = useState(null);
  const webViewRef = useRef(null);
  const workerRef = useRef(null);
  const pendingRequests = useRef(new Map());
  const reqId = useRef(0);

  useEffect(() => {
    async function init() {
      try {
        // Copy frontend assets to filesystem
        const asset = await Asset.fromModule(require('./assets/frontend/index.html'));
        const localUri = asset.localUri || asset.uri;
        setFrontendUri(localUri);

        // Start Bare worker
        const worker = new BareKit.Worker(WORKER_BUNDLE);
        workerRef.current = worker;

        worker.on('message', (data) => {
          const msg = JSON.parse(data);
          if (msg.type === 'ready') {
            setWorkerReady(true);
            setModelStatus('ready');
          } else if (msg.type === 'model-progress') {
            setModelStatus(`downloading model: ${Math.round(msg.progress * 100)}%`);
          } else if (msg.type === 'model-loaded') {
            setModelStatus('ready');
          } else if (msg.type === 'model-error') {
            setModelStatus(`model error: ${msg.error}`);
          } else if (msg.type === 'response') {
            const cb = pendingRequests.current.get(msg.id);
            if (cb) {
              cb(msg);
              pendingRequests.current.delete(msg.id);
            }
          }
        });

        worker.on('error', (err) => {
          console.error('Worker error:', err);
          setModelStatus('worker error: ' + err.message);
        });

      } catch (e) {
        console.error('Init error:', e);
        setModelStatus('init error: ' + e.message);
      }
    }
    init();

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const sendToWorker = (payload) => {
    return new Promise((resolve) => {
      const id = ++reqId.current;
      pendingRequests.current.set(id, resolve);
      workerRef.current.postMessage(JSON.stringify({ id, ...payload }));
    });
  };

  const handleWebViewMessage = async (event) => {
    try {
      const { id, method, path, body } = JSON.parse(event.nativeEvent.data);
      const res = await sendToWorker({ method, path, body });
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

      // Override fetch for API calls (both /api/* and localhost:3002/api/*)
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
            }, 60000);
          });
        }
        return originalFetch(url, options);
      };

      // Notify native that bridge is ready
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
