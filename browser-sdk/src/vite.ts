/**
 * Optional Vite plugin for @localchimera/browser-sdk.
 *
 * The browser SDK dynamically imports large optional peer dependencies
 * (WebLLM, transformers.js, Helia, Wasmer, etc.) only when they are actually
 * needed. By default, Vite's pre-bundler and Rollup production build try to
 * resolve these imports even though the packages may not be installed. This
 * plugin:
 *
 *   - Excludes the SDK from dependency pre-bundling so the dynamic imports stay
 *     runtime-only during `vite dev` / preview.
 *   - Externalizes the optional peer dependencies in production builds so
 *     `vite build` succeeds without installing them.
 *
 * Usage in vite.config.js:
 *
 *   import { defineConfig } from 'vite'
 *   import react from '@vitejs/plugin-react'
 *   import { chimeraBrowserSDK } from '@localchimera/browser-sdk/vite'
 *
 *   export default defineConfig({
 *     plugins: [react(), chimeraBrowserSDK()],
 *     server: { host: true },
 *   })
 */

export const OPTIONAL_PEER_DEPS = [
  '@mlc-ai/web-llm',
  '@huggingface/transformers',
  'helia',
  '@helia/ipfs',
  '@helia/unixfs',
  '@wasmer/sdk',
  'multiformats',
  'multiformats/cid',
];

export interface ChimeraBrowserSDKPluginOptions {
  /** Extra packages to treat as optional / external. */
  extra?: string[];
}

export function chimeraBrowserSDK(options: ChimeraBrowserSDKPluginOptions = {}) {
  const external = [...OPTIONAL_PEER_DEPS, ...(options.extra || [])];

  return {
    name: 'chimera-browser-sdk',
    config: () => ({
      optimizeDeps: {
        exclude: ['@localchimera/browser-sdk'],
      },
      build: {
        rollupOptions: {
          external,
        },
      },
    }),
  };
}

export default chimeraBrowserSDK;
