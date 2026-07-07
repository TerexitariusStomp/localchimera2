import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'path'

const mobileBuild = process.env.MOBILE_BUILD === 'true'

export default defineConfig({
  plugins: mobileBuild ? [react(), viteSingleFile()] : [react(), viteSingleFile()],
  base: './',
  resolve: {
    dedupe: ['@web3auth/modal', '@web3auth/base', '@web3auth/ethereum-provider', 'react', 'react-dom', 'wagmi', 'viem', 'connectkit', '@tanstack/react-query', '@solana/wallet-adapter-react-ui', '@solana/wallet-adapter-react', '@solana/wallet-adapter-wallets', '@solana/wallet-adapter-base', '@solana/web3.js'],
    alias: {
      '@localchimera/browser-sdk': path.resolve(__dirname, '../../browser-sdk/dist/index.js'),
      '@localchimera/sdk': path.resolve(__dirname, '../../sdk'),
    },
  },
  build: {
    rollupOptions: {
      // @localchimera/browser-sdk is bundled so the mobile APK is self-contained
      output: mobileBuild ? { format: 'iife' } : {},
    }
  },
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true
      }
    }
  }
})
